import { describe, expect, it } from "vitest";
import { aliyunRpcSignature } from "../sign";

// The expected value is printed in Alibaba Cloud's signing guide (fetched
// 2026-11-02); a signature that reproduces it is the cloud's.

describe("Alibaba Cloud RPC signature", () => {
	// help.aliyun.com/zh/sdk/product-overview/rpc-mechanism
	it("signs the guide's DescribeDedicatedHosts call", () => {
		const params = {
			AccessKeyId: "testid",
			Action: "DescribeDedicatedHosts",
			Format: "JSON",
			RegionId: "cn-beijing",
			SignatureMethod: "HMAC-SHA1",
			SignatureNonce: "edb2b34af0af9a6d14deaf7c1a5315eb",
			SignatureVersion: "1.0",
			Timestamp: "2023-03-13T08:34:30Z",
			Version: "2014-05-26",
		};
		expect(aliyunRpcSignature("GET", params, "testsecret")).toBe("9NaGiOspFP5UPcwX8Iwt2YJXXuk=");
	});
});
