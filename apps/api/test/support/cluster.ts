export interface TestCluster {
  /** Superuser connection string for the throw-away cluster. Tests use it only for fixtures and tampering. */
  adminUrl: string;
  roles: { migrator: string; agentApi: string; management: string };
}

declare module "vitest" {
  export interface ProvidedContext {
    axoCluster: TestCluster;
  }
}
