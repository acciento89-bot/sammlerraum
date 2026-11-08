export class EnvironmentConfigurationError extends Error {
  readonly invalidVariables: readonly string[];

  constructor(invalidVariables: readonly string[]) {
    super(`Invalid environment configuration: ${invalidVariables.join(", ")}`);
    this.name = "EnvironmentConfigurationError";
    this.invalidVariables = invalidVariables;
  }
}
