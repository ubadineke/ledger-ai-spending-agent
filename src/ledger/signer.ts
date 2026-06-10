import { DeviceManagementKitBuilder, DeviceActionStatus } from "@ledgerhq/device-management-kit";
import { speculosTransportFactory } from "@ledgerhq/device-transport-kit-speculos";
import { SignerEthBuilder } from "@ledgerhq/device-signer-kit-ethereum";
import { Transaction, parseEther, parseUnits } from "ethers";
import { firstValueFrom } from "rxjs";
import { TransferIntent, SignResult } from "../types.js";

const SPECULOS_URL = process.env.SPECULOS_URL ?? "http://localhost:5001";
const DERIVATION_PATH = "44'/60'/0'/0/0";

const CHAIN_IDS: Record<string, number> = {
  ethereum: 1,
  sepolia: 11155111,
};

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

export async function signTransaction(intent: TransferIntent): Promise<SignResult> {
  const dmk = new DeviceManagementKitBuilder()
    .addTransport(speculosTransportFactory(SPECULOS_URL))
    .build();

  try {
    console.log(`\n  [DMK] Connecting to Speculos at ${SPECULOS_URL}...`);
    const device = await firstValueFrom(dmk.startDiscovering({}));
    console.log(`  [DMK] Device found: ${device.name}`);

    const sessionId = await dmk.connect({ device });
    console.log("  [DMK] Session opened");

    const signerEth = new SignerEthBuilder({ dmk, sessionId }).build();

    const txBuffer = buildUnsignedTx(intent);
    console.log(`  [DMK] Transaction built (${txBuffer.length} bytes)`);
    console.log(`\n  [Ledger] Open ${SPECULOS_URL} in your browser`);
    console.log("  [Ledger] Review the transaction on the mock device and click Approve\n");

    const result = await new Promise<SignResult>((resolve) => {
      const { observable } = signerEth.signTransaction(DERIVATION_PATH, txBuffer, {});

      observable.subscribe({
        next: (state) => {
          if (state.status === DeviceActionStatus.Pending) {
            console.log("  [DMK] Pending...");
          } else if (state.status === DeviceActionStatus.Completed) {
            const sig = state.output;
            resolve({
              status: "signed",
              output: `r=${sig.r}  s=${sig.s}  v=${sig.v}`,
            });
          } else if (state.status === DeviceActionStatus.Error) {
            resolve({
              status: "error",
              output: String(state.error) ?? "Signing failed",
            });
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
