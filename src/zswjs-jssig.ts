/**
 * @module JS-Sig
 */
// copyright defined in zswjs/LICENSE.txt

import { ec } from 'elliptic';

import { SignatureProvider, SignatureProviderArgs } from './zswjs-api-interfaces';
import { PushTransactionArgs } from './zswjs-rpc-interfaces';
import {
    PrivateKey,
    PublicKey,
    Signature,
} from './zswjs-key-conversions';
import { convertLegacyPublicKey } from './zswjs-numeric';

/** expensive to construct; so we do it once and reuse it */
const defaultEc = new ec('secp256k1');

/** Construct the digest from transaction details */
const digestFromSerializedData = (
    chainId: string,
    serializedTransaction: Uint8Array,
    serializedContextFreeData?: Uint8Array,
    e = defaultEc): string => {
    const signBuf = Buffer.concat([
        Buffer.from(chainId, 'hex'),
        Buffer.from(serializedTransaction),
        Buffer.from(
            serializedContextFreeData ?
                new Uint8Array(e.hash().update(serializedContextFreeData).digest()) :
                new Uint8Array(32)
        ),
    ]);
    return e.hash().update(signBuf).digest();
};

/** Signs transactions using in-process private keys */
class JsSignatureProvider implements SignatureProvider {
    /** map public to private keys */
    public keys = new Map<string, ec.KeyPair>();

    /** public keys */
    public availableKeys = [] as string[];

    /** @param privateKeys private keys to sign with */
    constructor(privateKeys: string[]) {
        for (const k of privateKeys) {
            const priv = PrivateKey.fromString(k);
            const privElliptic = priv.toElliptic();
            const pubStr = priv.getPublicKey().toString();
            this.keys.set(pubStr, privElliptic);
            this.availableKeys.push(pubStr);
        }
    }

    /** Public keys associated with the private keys that the `SignatureProvider` holds */
    public async getAvailableKeys(): Promise<string[]> {
        return this.availableKeys;
    }

    /** Sign a transaction */
    public async sign(
        { chainId, requiredKeys, serializedTransaction, serializedContextFreeData }: SignatureProviderArgs,
    ): Promise<PushTransactionArgs> {
        const digest = digestFromSerializedData( chainId, serializedTransaction, serializedContextFreeData, defaultEc);

        const signatures = [] as string[];
        for (const key of requiredKeys) {
            const publicKey = PublicKey.fromString(key);
            const ellipticPrivateKey = this.keys.get(convertLegacyPublicKey(key));
            const privateKey = PrivateKey.fromElliptic(ellipticPrivateKey!, publicKey.getType());
            const signature = privateKey.sign(digest, false);
            signatures.push(signature.toString());
        }

        return { signatures, serializedTransaction, serializedContextFreeData };
    }
}

export {
    PrivateKey,
    PublicKey,
    Signature,
    digestFromSerializedData,
    JsSignatureProvider,
};
