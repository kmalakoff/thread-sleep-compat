import { allTargets } from 'node-abi';
import semver from 'semver';

function patchVersions() {
  let abi = null;
  const runtime = 'node';
  const target = process.versions.node;
  for (let i = 0; i < allTargets.length; i++) {
    const t = allTargets[i];
    if (t.runtime !== runtime) continue;
    if (semver.lte(t.target, target)) abi = t.abi;
    else break;
  }
  return abi;
}

if (!process.versions.modules) process.versions.modules = patchVersions();
