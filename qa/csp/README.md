# CSP checks

```sh
npm run qa:csp     # pure text, milliseconds, no browser
```

## Why this exists

#108 replaced `script-src 'unsafe-inline'` with a sha256 hash of the one
inline script left on the game shells. That is a real improvement — it is the
difference between a policy that stops an injected `<script>` and one that
does not — but it introduces a failure mode worse than the thing it fixed.

**A stale hash fails silently.** Edit the inline pre-init sizing script by one
character and the browser quietly declines to run it. Nothing throws, no
request fails, no exception the game can catch. The shell simply never sizes
itself, and every functional check in the repo goes on passing.

So the hash is only worth having alongside something that recomputes it.

## What it checks, per page

- `script-src` does not allow `'unsafe-inline'`
- every inline script on the page is covered by a hash in the policy
- every hash in the policy covers a script that is actually on the page —
  a hash left behind after its script was deleted grants permission to
  nothing, which reads as protection it is not providing
- no fetch directive names an external host (#102 took that to zero)
- `default-src`, `base-uri` and `form-action` are all `'none'`

## Two layers, deliberately

This one is text: it catches the *source* drifting away from its hash, which
is the common case, and it runs in milliseconds so there is no reason to skip
it.

It cannot catch a build step rewriting the script after the policy is written.
`qa:touch` covers that end — it loads all five games in a real browser and
treats console errors as failures, and a blocked inline script logs
`Refused to execute inline script`. Both halves were verified by corrupting
the hash and watching each go red.

## What is deliberately not here

`style-src` keeps `'unsafe-inline'`. The pre-init script builds a `<style>`
element at runtime with a computed width and height, and a stylesheet written
after the policy is served cannot be hashed ahead of it. The hub may not need
the allowance at all, but that is unmeasured rather than known — it is a
bundled app that may set styles at runtime, so tightening it wants its own
measurement.
