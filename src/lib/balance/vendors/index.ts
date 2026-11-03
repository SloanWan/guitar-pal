import type { VendorCheck } from "../types";
import { aliyun } from "./aliyun";
import { deepseek } from "./deepseek";

/** Every vendor the table lists, in the order it lists them. */
export const VENDORS: readonly VendorCheck[] = [deepseek, aliyun];
