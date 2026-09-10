/**
 * Status-line plugin, node half. The empty apply exists so the package appears
 * in the host cordis.yml and the Loader mounts it; the browser half ships
 * through exports["./client"], discovered from the package.json `dsh.client`
 * declaration.
 */

/** Host plugin body — the status line has no host-side behavior. */
export function apply(): void {}
