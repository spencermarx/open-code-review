# Coding Standards

Project-wide coding standards. These are authored once and applied globally — do not repeat them as inline comments in source files.

## TypeScript

- **Prefer `type` over `interface`.** Use `type` for all type aliases, unions, intersections, mapped types, and utility types. Use `interface` only when you need declaration merging (e.g., augmenting third-party module declarations). When in doubt, reach for `type`.
