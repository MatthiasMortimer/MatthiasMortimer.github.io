const runtimeEnv = require("./runtime-env.cjs");
const base = require("../devApps/siteHosting/host-config.json");

function buildHostingConfig(source = base) {
	const productionPort = runtimeEnv.port(source.productionPort);
	const devInternalPort = runtimeEnv.port(source.devInternalPort);
	const localUrl = `http://127.0.0.1:${productionPort}`;
	return {
		...source,
		env: runtimeEnv.name,
		tunnelEnabled: !runtimeEnv.isTest,
		productionPort,
		devInternalPort,
		legacyDevGatewayPort: runtimeEnv.port(source.legacyDevGatewayPort),
		localUrl,
		devLocalUrl: `http://127.0.0.1:${devInternalPort}/`,
		publicUrl: runtimeEnv.isTest ? localUrl : source.publicUrl,
	};
}

module.exports = { buildHostingConfig };
