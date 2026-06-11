export const GENLAYER_STUDIONET = {
  name: "GenLayer Studionet",
  chainId: 61999,
  rpcUrl: "https://studio.genlayer.com/api",
  currency: "GEN",
  explorerUrl: "https://explorer-studio.genlayer.com",
};

export const PROCURA_CONTRACT_ADDRESS =
  (process.env.NEXT_PUBLIC_GENLAYER_CONTRACT_ADDRESS || "") as `0x${string}` | "";

export const CONTRACT_CONFIGURED = PROCURA_CONTRACT_ADDRESS.length > 0;

export const NOT_CONFIGURED_MESSAGE =
  "GenLayer contract is not configured yet.\nDeploy Procura and add NEXT_PUBLIC_GENLAYER_CONTRACT_ADDRESS to enable live procurement evaluations.";
