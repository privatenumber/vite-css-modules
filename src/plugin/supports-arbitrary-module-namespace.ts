import type { ResolvedConfig } from 'vite';

type Version = [number, number?, number?];

/**
 * Env versions where arbitrary module namespaces were introduced
 * https://github.com/evanw/esbuild/blob/c809af050a74f022d9cf61c66e13365434542420/compat-table/src/index.ts#L464-L476
 */
const arbitraryModuleNamespaceNames = {
	// https://github.com/evanw/esbuild/blob/c809af050a74f022d9cf61c66e13365434542420/compat-table/src/index.ts#L392
	es: [2022],
	chrome: [90],
	node: [16],
	firefox: [87],
	safari: [14, 1],
	ios: [14, 5],
} satisfies Record<string, Version>;

const targetPattern = /^(chrome|deno|edge|firefox|hermes|ie|ios|node|opera|rhino|safari|es)(\w+)/i;
const parseTarget = (
	target: string,
) => {
	const hasType = target.match(targetPattern);
	if (!hasType) {
		return;
	}

	const [, type, version] = hasType;
	return [
		type!.toLowerCase(),
		version!.split('.').map(Number),
	] as [
		keyof typeof arbitraryModuleNamespaceNames,
		Version
	];
};

const compareSemver = (
	semverA: Version,
	semverB: Version,
) => (
	semverA[0] - semverB[0]
	|| (semverA[1] || 0) - (semverB[1] || 0)
	|| (semverA[2] || 0) - (semverB[2] || 0)
	|| 0
);

export const supportsArbitraryModuleNamespace = (
	{ build: { target: targets } }: ResolvedConfig,
) => Boolean(
	targets
		&& (Array.isArray(targets) ? targets : [targets]).every((target) => {
			if (target === 'esnext') {
				return true;
			}

			const hasType = parseTarget(target);
			if (!hasType) {
				return false;
			}

			const [type, version] = hasType;
			const addedInVersion = arbitraryModuleNamespaceNames[type];
			if (!addedInVersion) {
				return false;
			}

			return compareSemver(addedInVersion, version) <= 0;
		}),
);
