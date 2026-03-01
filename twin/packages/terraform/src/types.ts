// Subset of `terraform show -json` output format (Terraform >= 1.0)

export type TfSgRule = {
  from_port: number;
  to_port: number;
  protocol: string;
  cidr_blocks?: string[];
  ipv6_cidr_blocks?: string[];
  security_groups?: string[];
  self?: boolean;
  description?: string;
};

export type TfResourceValues = {
  // Security group
  ingress?: TfSgRule[];
  egress?: TfSgRule[];
  // Compute
  vpc_security_group_ids?: string[];
  security_groups?: string[];
  // Load balancer
  internal?: boolean;
  // Shared
  name?: string;
  tags?: Record<string, string>;
  [key: string]: unknown;
};

export type TfResource = {
  address: string;
  type: string;
  name: string;
  provider_name?: string;
  values: TfResourceValues;
};

export type TfModule = {
  resources?: TfResource[];
  child_modules?: TfModule[];
};

export type TfPlan = {
  format_version?: string;
  terraform_version?: string;
  planned_values?: {
    root_module?: TfModule;
  };
  // present when running `terraform show -json` on state file
  values?: {
    root_module?: TfModule;
  };
};
