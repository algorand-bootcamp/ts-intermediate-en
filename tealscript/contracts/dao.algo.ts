import { Contract } from '@algorandfoundation/tealscript';

// eslint-disable-next-line no-unused-vars
class Dao extends Contract {
  registeredAsaId = GlobalStateKey<Asset>();

  proposal = GlobalStateKey<string>();

  votesTotal = GlobalStateKey<number>();

  votesInFavor = GlobalStateKey<number>();

  inFavor = LocalStateKey<boolean>();

  createApplication(proposal: string): void {
    this.proposal.value = proposal;
  }

  bootstrap(): Asset {
    verifyTxn(this.txn, { sender: this.app.creator });
    assert(!this.registeredAsaId.exists);
    const registeredAsa = sendAssetCreation({
      configAssetTotal: 1_000,
      configAssetFreeze: this.app.address,
      configAssetClawback: this.app.address,
    });
    this.registeredAsaId.value = registeredAsa;
    return registeredAsa;
  }

  // eslint-disable-next-line no-unused-vars
  optInToApplication(registeredASA: Asset): void {
    assert(this.txn.sender.assetBalance(this.registeredAsaId.value) === 0);
    sendAssetTransfer({
      xferAsset: this.registeredAsaId.value,
      assetReceiver: this.txn.sender,
      assetAmount: 1,
    });
    sendAssetFreeze({
      freezeAsset: this.registeredAsaId.value,
      freezeAssetAccount: this.txn.sender,
      freezeAssetFrozen: true,
    });
  }

  private forgetVote(): void {
    if (this.inFavor(this.txn.sender).exists) {
      this.votesTotal.value = this.votesTotal.value - 1;
      if (this.inFavor(this.txn.sender).value) {
        this.votesInFavor.value = this.votesInFavor.value - 1;
      }
    }
  }

  // eslint-disable-next-line no-unused-vars
  closeOutOfApplication(registeredASA: Asset): void {
    assert(this.txn.sender.assetBalance(this.registeredAsaId.value) === 1);
    sendAssetTransfer({
      xferAsset: this.registeredAsaId.value,
      assetSender: this.txn.sender,
      assetReceiver: this.app.address,
      assetAmount: 1,
    });
    this.forgetVote();
  }

  clearState(): void {
    this.forgetVote();
  }

  // eslint-disable-next-line no-unused-vars
  vote(inFavor: boolean, registeredASA: Asset): void {
    assert(this.txn.sender.assetBalance(this.registeredAsaId.value) === 1);
    assert(!this.inFavor(this.txn.sender).exists);
    this.inFavor(this.txn.sender).value = inFavor;

    this.votesTotal.value = this.votesTotal.value + 1;
    if (inFavor) {
      this.votesInFavor.value = this.votesInFavor.value + 1;
    }
  }

  getProposal(): string {
    return this.proposal.value;
  }

  getRegisteredASA(): Asset {
    return this.registeredAsaId.value;
  }

  getVotes(): [number, number] {
    return [this.votesInFavor.value, this.votesTotal.value];
  }
}
