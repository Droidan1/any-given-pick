import { EmailAlertChannel } from "checkly/constructs";

export const brianOperationsEmail = new EmailAlertChannel(
  "brian-operations-email",
  {
    address: "brian@Droidan1.dev",
    sendFailure: true,
    sendRecovery: true,
    sendDegraded: false,
    sslExpiry: true,
    sslExpiryThreshold: 14,
  },
);
