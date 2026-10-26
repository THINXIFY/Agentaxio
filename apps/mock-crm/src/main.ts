import { createMockCrm } from "./server";

/**
 * Run the mock CRM on loopback. AXO_MOCK_CRM_TOKEN must be set (at least 32 characters): it is the one secret the
 * executor presents. The mock stores leads in memory only.
 */
const token = process.env.AXO_MOCK_CRM_TOKEN;
if (token === undefined || token.length < 32) {
  process.stderr.write("AXO_MOCK_CRM_TOKEN must be set to at least 32 characters\n");
  process.exit(1);
}
const crm = createMockCrm({ token });
const { url } = await crm.listen(Number(process.env.MOCK_CRM_PORT ?? "8790"));
process.stdout.write(`Mock CRM (not a real system) listening on ${url}\n`);
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    void crm.close().then(() => process.exit(0));
  });
}
