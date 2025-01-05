import { useState } from 'react';
import DOMPurify from 'dompurify';
import ReactHtmlParser from 'react-html-parser';

import { Buffer } from 'buffer';
window.Buffer = Buffer;

import { KeyPair, mnemonicNew, mnemonicToPrivateKey, keyPairFromSecretKey, keyPairFromSeed } from '@ton/crypto';

import { JsonnableEd25519KeyIdentity } from '@dfinity/identity/lib/esm/identity/ed25519';
import getRandomValues from 'get-random-values';

import { AuthClient } from '@dfinity/auth-client';
import { Identity } from '@dfinity/agent';

const testnetEndpoint: string = 'https://testnet.toncenter.com/api/v2/jsonRPC?api_key=12ef1fc91b0d4ee237475fed09efc66af909d83f72376c7c3c42bc9170847ecb';
const explorer: string = 'https://testnet.tonviewer.com/';
const workchain = 0; // Usually you need a workchain 0
const devWalletAddress = '0QDQBpCcv361Q785LZ33ky4fowYlgSYLTEIRTPzHVOaAhsVm';

const BACKEND_API_URL = import.meta.env.VITE_BACKEND_CANISTER_ENDPOINT;
const II_URL = import.meta.env.VITE_II_CANISTER_ENDPOINT;
const DEFAULT_MAX_TIME_TO_LIVE = /* hours */ BigInt(8) * /* nanoseconds */ BigInt(3_600_000_000_000);
const ED25519_KEY_LABEL = 'Ed25519';

interface sysWallet {
  address: string;
  addressICP: string;
  mnemonic: string[] | null;
  keyPair: KeyPair | null;
  keyPairJSON: JsonnableEd25519KeyIdentity | null;
}

const sysWallet: sysWallet = {
  address: '',
  addressICP: '',
  mnemonic: null,
  keyPair: null,
  keyPairJSON: null
}

// ii
let ii:Identity | null = null;

const App = () => {
  const [balanceResponse, setBalanceResponse] = useState('...');
  const [sendTONResponse, setSendTONResponse] = useState('...');
  const [transactionsResponse, setTransactionsResponse] = useState('...');
  const [sendTONAddress, setSendTONAddress] = useState(devWalletAddress);
  const [createWalletCFResponse, setCreateWalletCFResponse] = useState('...');

  // II
  /**
   * Check II
   */
  const IICheck = async (): Promise<void> => {
    setCreateWalletCFResponse('Checking II');

    // check
    if (ii === null) {
      setCreateWalletCFResponse('No II found');
    } else {
      try {
        await IISetWallet(ii);
        setCreateWalletCFResponse(`Current II: ${createWalletCFResponse}`);
      } catch (e) {
        setCreateWalletCFResponse(`Error in IICheck #01: ${e}`);
      }
    }
  };

  const IILogin = async (): Promise<void> => {
    setCreateWalletCFResponse('Logining with II');

    try {
      // create an auth client
      const authClient = await AuthClient.create({ keyType: ED25519_KEY_LABEL });

      // check
      if (ii !== null) {
        ii = null;
        const msg = 'Previous II found. Logging out... ';
        setCreateWalletCFResponse(msg);
        await authClient.logout();
        setCreateWalletCFResponse(`${msg} Done`);
      }

      await new Promise((resolve) => {
        authClient.login({
          identityProvider: II_URL,
          maxTimeToLive: DEFAULT_MAX_TIME_TO_LIVE,
          onSuccess: resolve
        });
      });

      const identity = authClient.getIdentity();
      ii = identity;
      await IISetWallet(identity);
    } catch (e) {
      setCreateWalletCFResponse(`Error in IILogin #01: ${e}`);
    }
  };

  const IILout = async (): Promise<void> => {
    setCreateWalletCFResponse('Logging out from II');

    try {
      // create an auth client
      const authClient = await AuthClient.create({ keyType: ED25519_KEY_LABEL });

      // check
      if (ii !== null) {
        ii = null;
        const msg = 'Previous II found. Logging out... ';
        setCreateWalletCFResponse(msg);
        await authClient.logout();
        setCreateWalletCFResponse(`${msg} Done`);
      } else {
        setCreateWalletCFResponse('No II found.');
      }
    } catch (e) {
      setCreateWalletCFResponse(`Error in IILout #01: ${e}`);
    }
  };

  const IISetWallet = async (_ii: any): Promise<void> => {
    if (_ii === null) {
      setCreateWalletCFResponse('You haven\'t logged in with II.');
      return;
    }

    // import
    const WalletContractV4 = (await import('@ton/ton')).WalletContractV4;
    // ac
    let authClient = await AuthClient.create({ keyType: ED25519_KEY_LABEL });
    // recover info, wallet
    let _addrICP = authClient.getIdentity().getPrincipal().toText();
    let keyPair = _ii._inner.toJSON();
    let pubKeyStr = toHexString(_ii._inner.getPublicKey().toRaw());
    keyPair[0] = pubKeyStr;
    let pubKey = Buffer.from(pubKeyStr, 'hex');
    let wallet = WalletContractV4.create({ workchain, publicKey: pubKey });
    let combineKey = keyPair[1] + keyPair[0];
    let privKey = Buffer.from(combineKey, 'hex');
    const address = wallet.address.toString({ testOnly: false, bounceable: false });
    // set sys wallet
    sysWallet.address = address;
    sysWallet.addressICP = _addrICP;
    sysWallet.keyPairJSON = keyPair;
    // out
    setCreateWalletCFResponse(`TON Address: ${address}<br />Principal: ${_addrICP}<br />Public Key: ${pubKeyStr}<br />Secret Key: ${keyPair[1]}`);
  }

  /**
   * ICP Chain Fusion - identity
   */
  const createWalletCF = async (): Promise<void> => {
      setCreateWalletCFResponse('Loading...');

      try {
        const identity = (await import('@dfinity/identity'));
        const WalletContractV4 = (await import('@ton/ton')).WalletContractV4;
        const ton = (await import('@ton/ton'));

        // ICP ID
        const entropy = getRandomValues(new Uint8Array(32));
        const did = identity.Ed25519KeyIdentity.generate(entropy);

        // keyPair
        // const _keyPair = did.getKeyPair();

        // address
        const _addrICP = did.getPrincipal().toString();
        let [pubKey, privKey] = did.toJSON();

        // hack 1 -> actual pk is here
        pubKey = toHexString(did.getPublicKey().toRaw());
        const _publicKey = Buffer.from(pubKey, 'hex');

        // use public key to create TON wallet
        let wallet = WalletContractV4.create({ workchain, publicKey: _publicKey });
        const address = wallet.address.toString({ testOnly: false, bounceable: false });

        // set sys wallet
        sysWallet.address = address;
        sysWallet.addressICP = _addrICP;
        sysWallet.keyPairJSON = [pubKey, privKey];

        // out
        setCreateWalletCFResponse(`TON Address: ${address}<br />Principal: ${_addrICP}<br />Public Key: ${pubKey}<br />Secret Key: ${privKey}`);
      } catch (e) {
        setCreateWalletCFResponse(`Error in createWalletCF #01: ${e}`);
      }
  }

  /**
   * ICP Chain Fusion - HTTPS outcalls
   */
  const getBalance = async (): Promise<void> => {
    setBalanceResponse('Loading...');

    try {
      // https outcall
      const response = await fetch(
        `${BACKEND_API_URL}token/balance`,
        {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ address: sysWallet.address})
        }
      );

      const responseText = await response.json();

      try {
        const balance = parseFloat(BigInt(responseText.result).toString()) / (10 ** 9);
        console.log(responseText)
        setBalanceResponse(`${balance} TON`);
      } catch (e) {
        setBalanceResponse(`Error in getBalance #01: ${e}`);
      }
    } catch (e) {
      setBalanceResponse(`Error in getBalance #02: ${e}`);
    }
  }

  /**
   * ICP Chain Fusion - HTTPS outcalls
   */
  const getTransactions = async (): Promise<void> => {
    setTransactionsResponse('Loading...');

    try {
      // https outcall
      const response = await fetch(
        `${BACKEND_API_URL}token/transactions`,
        {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ address: sysWallet.address})
        }
      );

      try {
        const responseText = await response.text();
        setTransactionsResponse(responseText);
      } catch (e) {
        setTransactionsResponse(`Error in getTransactions #01: ${e}`);
      }
    } catch (e) {
      setTransactionsResponse(`Error in getTransactions #02: ${e}`);
    }
  }

  /**
   * ICP Chain Fusion - identity
   */
  const sendTON = async (): Promise<void> => {
    setSendTONResponse('Loading...');
    let isAddressValid = false;

    // check address
    try {
      const Address = (await import('@ton/core')).Address;
      const address = Address.parse(sendTONAddress);
      console.log('Address is valid.');
      console.log(`${address}`);
      console.log('Address is valid.');
      isAddressValid = true;
    } catch (e) {
      setSendTONResponse(`Error in sendTON #00: ${sendTONAddress} is not valid. (${e})`);
    }

    // break flow on error
    if (!isAddressValid) {
      return;
    }
      
    // trans
    try {
        const TonClient = (await import('@ton/ton')).TonClient;
        const WalletContractV4 = (await import('@ton/ton')).WalletContractV4;
        const internal = (await import('@ton/ton')).internal;
        // Create Client
        const client = new TonClient({
          endpoint: testnetEndpoint,
        });
        // hack 2 -> sim TON secret key
        let _combineKey = sysWallet.keyPairJSON![1] + sysWallet.keyPairJSON![0];
        let _publicKey = sysWallet.keyPair ? sysWallet.keyPair!.publicKey : Buffer.from(sysWallet.keyPairJSON![0], 'hex');
        let _secretKey = sysWallet.keyPair ? sysWallet.keyPair!.secretKey : Buffer.from(_combineKey, 'hex');

        console.log(_secretKey);

        let wallet = WalletContractV4.create({ workchain, publicKey: _publicKey });
        let contract = client.open(wallet);

        // Create a transfer
        let seqno: number = await contract.getSeqno();

        const internal_msg = internal({
            to: devWalletAddress,
            value: '0.001',
            init: undefined,
            body: `Test@${Date.now()}`
        });

        let transfer = contract.createTransfer({
          seqno,
          secretKey: _secretKey,
          messages: [internal_msg]
        });

        await contract.send(transfer);

        // const hash = internal_msg.body.hash().toString('hex');
        // console.log(internal_msg);

        //const hash = await getHash(transfer, wallet.address);
        // setSendTONResponse(`Done<br /><a href="${explorer}transaction/${hash}" target="_blank">${hash}</a><br /><a href="${explorer}${devWalletAddress}" target="_blank">Address</a>`);

        setSendTONResponse(`Done. <a href="${explorer}${devWalletAddress}" target="_blank">Explorer 🗗</a>`);
    } catch (e) {
        setSendTONResponse(`Error in sendTON #01: ${e}`);
    }
  }

  const getHash = async(transfer: any, address: any): Promise<string> => {
      const external = (await import('@ton/ton')).external;
      const beginCell = (await import('@ton/ton')).beginCell;
      const storeMessage = (await import('@ton/ton')).storeMessage;
      // get external info
      let neededInit = null;
      const ext = external({
        to: address,
        init: neededInit,
        body: transfer,
      });
      // convert to boc
      let boc = beginCell().store(storeMessage(ext)).endCell();
      console.log(boc);
      // return hasn
      return boc.hash().toString('hex');
  }

  const handleAddressChange = (e: any) => {
      setSendTONAddress(e.target.value);
      console.log(e.target.value);
  }

  const toHexString = (byteArray:any) => {
    return Array.from(byteArray, function(byte:any) {
      return ('0' + (byte & 0xFF).toString(16)).slice(-2);
    }).join('')
  }

  return (
    <>
      <div className="card mb-3">
        <div className="card-header">
          <a href="#" className="btn btn-sm btn-primary" onClick={createWalletCF}>Create Wallet</a>
          <a href="#" className="btn btn-sm btn-primary btn-ii" style={{marginLeft: '15px'}} onClick={IICheck}>Check II</a>
          <a href="#" className="btn btn-sm btn-primary btn-ii" onClick={IILogin}>Login II</a>
          <a href="#" className="btn btn-sm btn-primary btn-ii" onClick={IILout}>Logout II</a>
        </div>
        <div className="card-body">
            <p className="card-text small">@difinity/identity.Ed25519KeyIdentity</p>
            <p className="card-text text-muted small">{ReactHtmlParser(DOMPurify.sanitize(createWalletCFResponse))}</p>
        </div>
        </div>
        <div className="card mb-3">
            <div className="card-header">
                <a href="#" className="btn btn-sm btn-primary" onClick={getBalance}>Get Balance</a>
            </div>
            <div className="card-body">
                <p className="card-text small">HTTPS Outcalls &lt;-&gt; TON RPC</p>
                <p className="card-text text-muted small">{ReactHtmlParser(DOMPurify.sanitize(balanceResponse))}</p>
            </div>
        </div>
        <div className="card mb-3">
            <div className="card-header">
                <a href="#" className="btn btn-sm btn-primary" onClick={sendTON}>Send TON</a>
            </div>
            <div className="card-body">
                <p className="card-text small">
                  <input type="text" className="form-control" value={sendTONAddress} onChange={handleAddressChange} />
                </p>
                <p className="card-text text-muted small">{ReactHtmlParser(DOMPurify.sanitize(sendTONResponse))}</p>
            </div>
        </div>
        <div className="card mb-3">
            <div className="card-header">
                <a href="#" className="btn btn-sm btn-primary" onClick={getTransactions}>Get Transactions</a>
            </div>
            <div className="card-body">
                <p className="card-text small">HTTPS Outcalls &lt;-&gt; TON RPC</p>
                <p className="card-text text-muted small">{ReactHtmlParser(DOMPurify.sanitize(transactionsResponse))}</p>
            </div>
        </div>

        <p className="text-muted">Dev Wallet: {devWalletAddress}</p>
      </>
  );
}

export default App;
