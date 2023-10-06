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
  beforeEach(fixture.beforeEach);

  beforeAll(async () => {
    await fixture.beforeEach();
    const { testAccount, kmd } = fixture.context;
    algod = fixture.context.algod;

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

    await appClient.create.createApplication({ proposal });
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
    await expect(appClient.vote({ inFavor: true, registeredASA }, { sender }))
      .rejects
      .toThrow();
  });

  test('register', async () => {
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
    await appClient.vote({ inFavor: true, registeredASA }, { sender });

    const votesAfter = await appClient.getVotes({});
    expect(votesAfter.return?.valueOf()).toEqual([BigInt(1), BigInt(1)]);

    await appClient.vote({ inFavor: false, registeredASA }, { sender });

    const votesAfter2 = await appClient.getVotes({});
    expect(votesAfter2.return?.valueOf()).toEqual([BigInt(1), BigInt(2)]);
  });
});
