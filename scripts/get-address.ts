import "dotenv/config";
import { DeviceManagementKitBuilder, DeviceActionStatus } from "@ledgerhq/device-management-kit";
import { speculosTransportFactory } from "@ledgerhq/device-transport-kit-speculos";
import { SignerEthBuilder } from "@ledgerhq/device-signer-kit-ethereum";
import { firstValueFrom } from "rxjs";

const SPECULOS_URL = process.env.SPECULOS_URL ?? "http://localhost:5001";
const PATH = "44'/60'/0'/0/0";

(async () => {
  const dmk = new DeviceManagementKitBuilder()
    .addTransport(speculosTransportFactory(SPECULOS_URL))
    .build();

  const device = await firstValueFrom(dmk.startDiscovering({}));
  const sessionId = await dmk.connect({ device });
  const signer = new SignerEthBuilder({ dmk, sessionId }).build();

  await new Promise<void>((resolve, reject) => {
    const { observable } = signer.getAddress(PATH, { checkOnDevice: false });
    observable.subscribe({
      next: (state) => {
        if (state.status === DeviceActionStatus.Completed) {
          console.log("\n  Speculos Ethereum address:");
          console.log(" ", state.output.address);
          console.log("\n  Fund this at https://cloud.google.com/application/web3/faucet/ethereum/sepolia\n");
          resolve();
        } else if (state.status === DeviceActionStatus.Error) {
          reject(state.error);
        }
      },
      error: reject,
    });
  });

  await dmk.disconnect({ sessionId }).catch(() => {});
  process.exit(0);
})();
