// Stands in for the "server-only" package under vitest. That package throws on
// import outside a React Server Component, which is a bundler-level guarantee
// rather than a runtime one — tests still exercise the real module.
export {};
