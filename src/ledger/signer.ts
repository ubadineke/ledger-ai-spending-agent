import { DeviceManagementKitBuilder, DeviceActionStatus } from "@ledgerhq/device-management-kit";
import { speculosTransportFactory } from "@ledgerhq/device-transport-kit-speculos";
import { SignerEthBuilder } from "@ledgerhq/device-signer-kit-ethereum";
import { Transaction, parseEther, parseUnits, JsonRpcProvider, formatEther } from "ethers";
import { firstValueFrom } from "rxjs";
import { TransferIntent, SignResult } from "../types.js";

const SPECULOS_URL = process.env.SPECULOS_URL ?? "http://localhost:5001";
const DERIVATION_PATH = "44'/60'/0'/0/0";

const CHAIN_IDS: Record<string, number> = {
  ethereum: 1,
  sepolia: 11155111,
};

type ProgressStep = "dmk" | "device";
type OnProgress = (step: ProgressStep, message: string) => void;

function buildUnsignedTx(intent: TransferIntent): Uint8Array {
  const chainId = CHAIN_IDS[intent.network] ?? 11155111;
  const tx = Transaction.from({
    type: 2,
    to: intent.to_address,
    value: parseEther(intent.amount_eth.toString()),
    chainId,
    nonce: 0,
    maxFeePerGas: parseUnits("20", "gwei"),
    maxPriorityFeePerGas: parseUnits("1", "gwei"),
    gasLimit: 21000n,
  });
  const hex = tx.unsignedSerialized.slice(2);
  return Uint8Array.from(Buffer.from(hex, "hex"));
}

const SEPOLIA_RPC = "https://ethereum-sepolia-rpc.publicnode.com";

function buildDmk() {
  return new DeviceManagementKitBuilder()
    .addTransport(speculosTransportFactory(SPECULOS_URL))
    .build();
}

export async function getWalletAddress(): Promise<string> {
  const dmk = buildDmk();
  const device = await firstValueFrom(dmk.startDiscovering({}));
  const sessionId = await dmk.connect({ device });
  const signer = new SignerEthBuilder({ dmk, sessionId }).build();

  const address = await new Promise<string>((resolve, reject) => {
    const { observable } = signer.getAddress(DERIVATION_PATH, { checkOnDevice: false });
    observable.subscribe({
      next: (state) => {
        if (state.status === DeviceActionStatus.Completed) resolve(state.output.address);
        else if (state.status === DeviceActionStatus.Error) reject(state.error);
      },
      error: reject,
    });
  });

  await dmk.disconnect({ sessionId }).catch(() => {});
  return address;
}

export async function getOnchainBalance(address: string): Promise<number> {
  const provider = new JsonRpcProvider(SEPOLIA_RPC);
  const raw = await provider.getBalance(address);
  return parseFloat(parseFloat(formatEther(raw)).toFixed(6));
}

export async function signTransaction(
  intent: TransferIntent,
  onProgress?: OnProgress
): Promise<SignResult> {
  const dmk = buildDmk();

  try {
    onProgress?.("dmk", `Connecting to Speculos at ${SPECULOS_URL}...`);
    const device = await firstValueFrom(dmk.startDiscovering({}));
    onProgress?.("dmk", `Device found: ${device.name}`);

    const sessionId = await dmk.connect({ device });
    onProgress?.("dmk", "Session opened — building transaction");

    const signerEth = new SignerEthBuilder({ dmk, sessionId }).build();
    const txBuffer = buildUnsignedTx(intent);

    onProgress?.("device", "Transaction sent to device — awaiting your approval");

    const result = await new Promise<SignResult>((resolve) => {
      const { observable } = signerEth.signTransaction(DERIVATION_PATH, txBuffer, {});

      observable.subscribe({
        next: (state) => {
          if (state.status === DeviceActionStatus.Pending) {
            onProgress?.("device", "Waiting for device...");
          } else if (state.status === DeviceActionStatus.Completed) {
            const sig = state.output;
            resolve({
              status: "signed",
              output: `r=${sig.r}  s=${sig.s}  v=${sig.v}`,
            });
          } else if (state.status === DeviceActionStatus.Error) {
            resolve({ status: "error", output: String(state.error) });
          }
        },
        error: (err: unknown) => {
          resolve({ status: "error", output: String(err) });
        },
      });
    });

    await dmk.disconnect({ sessionId }).catch(() => {});
    return result;
  } catch (err) {
    return { status: "error", output: String(err) };
  }
}
