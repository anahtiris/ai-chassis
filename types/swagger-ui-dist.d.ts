// swagger-ui-dist ships no types; only `absolute-path.js` is imported
// directly (server-side, to locate the static bundle — see
// app/api/vendor/swagger-ui).
declare module 'swagger-ui-dist/absolute-path' {
  function getAbsoluteFSPath(): string
  export default getAbsoluteFSPath
}
