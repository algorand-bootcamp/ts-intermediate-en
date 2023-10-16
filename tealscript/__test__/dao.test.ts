import {
  describe, test, expect, beforeAll, beforeEach,
} from '@jest/globals';
import algosdk from 'algosdk';
import * as algokit from '@algorandfoundation/algokit-utils';
import { algorandFixture } from '@algorandfoundation/algokit-utils/testing';
import { algos, microAlgos, getOrCreateKmdWalletAccount } from '@algorandfoundation/algokit-utils';
import { DaoClient } from '../contracts/clients/DaoClient';

const fixture = algorandFixture();

let appClient: DaoClient;

describe('Dao', () => {
  let algod: algosdk.Algodv2;
  let sender: algosdk.Account;
  const proposal = 'This is a proposal.';
  let registeredASA: bigint;

  const vote = async (inFavor: boolean) => {
    const { appAddress } = await appClient.appClient.getAppReference();

    const boxMBRPayment = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      from: sender.addr,
      to: appAddress,
      amount: 15_700,
      suggestedParams: await algokit.getTransactionParams(undefined, algod),
    });

    await appClient.vote(
      { inFavor, registeredASA, boxMBRPayment },
      { sender, boxes: [algosdk.decodeAddress(sender.addr).publicKey] },
    );
  };

  const register = async () => {
    const registeredAsaOptInTxn = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject(
      {
        from: sender.addr,
        to: sender.addr,
        amount: 0,
        suggestedParams: await algokit.getTransactionParams(undefined, algod),
        assetIndex: Number(registeredASA),
      },
    );

    await algokit.sendTransaction({ from: sender, transaction: registeredAsaOptInTxn }, algod);

    await appClient.register({ registeredASA }, {
      sender,
      sendParams: {
        fee: microAlgos(3_000),
      },
    });
  };

  const deregister = async () => {
    await appClient.deregister(
      { registeredASA },
      {
        sender,
        sendParams: { fee: algokit.microAlgos(3_000) },
        boxes: [algosdk.decodeAddress(sender.addr).publicKey],
      },
    );

    const { appAddress } = await appClient.appClient.getAppReference();

    const registeredAsaCloseTxn = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
      from: sender.addr,
      to: appAddress,
      closeRemainderTo: appAddress,
      amount: 0,
      assetIndex: Number(registeredASA),
      suggestedParams: await algokit.getTransactionParams(undefined, algod),
    });

    await algokit.sendTransaction({ transaction: registeredAsaCloseTxn, from: sender }, algod);
  };

  beforeEach(fixture.beforeEach);

  beforeAll(async () => {
    await fixture.beforeEach();
    const { testAccount, kmd } = fixture.context;
    algod = fixture.context.algod;
    await algod.setBlockOffsetTimestamp(1).do();

    sender = await getOrCreateKmdWalletAccount({
      name: 'tealscript-dao-sender',
      fundWith: algos(10),
    }, algod, kmd);

    appClient = new DaoClient(
      {
        sender: testAccount,
        resolveBy: 'id',
        id: 0,
      },
      algod,
    );

    await appClient.create.createApplication({ proposal, length: 100 });
  }, 15_000);

  test('getProposal', async () => {
    const proposalFromMethod = await appClient.getProposal({});
    expect(proposalFromMethod.return?.valueOf()).toBe(proposal);
  });

  test('bootstrap (Negative)', async () => {
    await appClient.appClient.fundAppAccount(microAlgos(200_000));

    await expect(appClient.bootstrap({}, {
      sender,
      sendParams: {
        fee: microAlgos(2_000),
      },
    })).rejects.toThrow();
  });

  test('bootstrap', async () => {
    const bootstrapResult = await appClient.bootstrap({}, {
      sendParams: {
        fee: microAlgos(2_000),
      },
    });
    registeredASA = bootstrapResult.return!.valueOf();
  });

  test('getRegisteredASA', async () => {
    const registeredAsaFromMethod = await appClient.getRegisteredAsa({});
    expect(registeredAsaFromMethod.return?.valueOf()).toBe(registeredASA);
  });

  test('vote (Negative)', async () => {
    await expect(vote)
      .rejects
      .toThrow();
  });

  test('register', async () => {
    await register();

    const registeredAsaTransferTxn = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
      from: sender.addr,
      to: sender.addr,
      amount: 1,
      assetIndex: Number(registeredASA),
      suggestedParams: await algokit.getTransactionParams(undefined, algod),
    });

    await expect(algokit.sendTransaction(
      { transaction: registeredAsaTransferTxn, from: sender },
      algod,
    )).rejects.toThrow();
  });

  test('vote & getVotes', async () => {
    await vote(true);

    const votesAfter = await appClient.getVotes({});
    expect(votesAfter.return?.valueOf()).toEqual([BigInt(1), BigInt(1)]);

    await expect(vote(false))
      .rejects
      .toThrow();

    const votesAfter2 = await appClient.getVotes({});
    expect(votesAfter2.return?.valueOf()).toEqual([BigInt(1), BigInt(1)]);
  });

  test('deregister', async () => {
    await appClient.deregister(
      { registeredASA },
      {
        sender,
        sendParams: { fee: algokit.microAlgos(3_000) },
        boxes: [algosdk.decodeAddress(sender.addr).publicKey],
      },
    );

    const votesAfter = await appClient.getVotes({});
    expect(votesAfter.return?.valueOf()).toEqual([BigInt(0), BigInt(0)]);

    await expect(vote(false))
      .rejects
      .toThrow();

    const { appAddress } = await appClient.appClient.getAppReference();

    const registeredAsaCloseTxn = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
      from: sender.addr,
      to: appAddress,
      closeRemainderTo: appAddress,
      amount: 0,
      assetIndex: Number(registeredASA),
      suggestedParams: await algokit.getTransactionParams(undefined, algod),
    });

    await algokit.sendTransaction({ transaction: registeredAsaCloseTxn, from: sender }, algod);

    await register();

    await vote(true);

    const votesAfter2 = await appClient.getVotes({});
    expect(votesAfter2.return?.valueOf()).toEqual([BigInt(1), BigInt(1)]);
  });

  test('endTime', async () => {
    await deregister();
    await algod.setBlockOffsetTimestamp(100).do();
    await register();

    await expect(vote(true)).rejects.toThrow();
  });
});
