# workers-ai-provider

## 0.3.0

### Minor Changes

- [#72](https://github.com/cloudflare/ai/pull/72) [`9b8dfc1`](https://github.com/cloudflare/ai/commit/9b8dfc1adc94079728634994d6afe81028ea11d8) Thanks [@andyjessop](https://github.com/andyjessop)! - feat: allow passthrough options as model settings

## 0.2.2

### Patch Changes

- [#65](https://github.com/cloudflare/ai/pull/65) [`b17cf52`](https://github.com/cloudflare/ai/commit/b17cf52757e51eb30da25370319daf8efc43791e) Thanks [@andyjessop](https://github.com/andyjessop)! - fix: gracefully handles streaming chunk without response property

## 0.2.1

### Patch Changes

- [#47](https://github.com/cloudflare/ai/pull/47) [`e000b7c`](https://github.com/cloudflare/ai/commit/e000b7c1c4a03f50810154854a001fa5500d8591) Thanks [@andyjessop](https://github.com/andyjessop)! - chore: implement generateImage function

## 0.2.0

### Minor Changes

- [#41](https://github.com/cloudflare/workers-ai-provider/pull/41) [`5bffa40`](https://github.com/cloudflare/workers-ai-provider/commit/5bffa404bfa2f70487d1c663481201b6b202351c) Thanks [@andyjessop](https://github.com/andyjessop)! - feat: adds the ability to use the provider outside of the workerd environment by providing Cloudflare accountId/apiKey credentials.

## 0.1.3

### Patch Changes

- [#39](https://github.com/cloudflare/workers-ai-provider/pull/39) [`9add2b5`](https://github.com/cloudflare/workers-ai-provider/commit/9add2b5c75e0c96e9ba936717a5fc399962f0f01) Thanks [@andyjessop](https://github.com/andyjessop)! - Trigger release for recent bug fixes

## 0.1.2

### Patch Changes

- [#35](https://github.com/cloudflare/workers-ai-provider/pull/35) [`9e74cc9`](https://github.com/cloudflare/workers-ai-provider/commit/9e74cc9ac939d77602d5a9873e717d9cd52e734f) Thanks [@andyjessop](https://github.com/andyjessop)! - Ensures that tool call data is available to model, by providing the JSON of the tool call as the content in the assistant message.

## 0.1.1

### Patch Changes

- [#32](https://github.com/cloudflare/workers-ai-provider/pull/32) [`9ffc5b8`](https://github.com/cloudflare/workers-ai-provider/commit/9ffc5b8640495440d0237ca3a201aaef1c7f441a) Thanks [@andyjessop](https://github.com/andyjessop)! - Fixes structured outputs

## 0.1.0

### Minor Changes

- [#29](https://github.com/cloudflare/workers-ai-provider/pull/29) [`762b37b`](https://github.com/cloudflare/workers-ai-provider/commit/762b37b05aee1ab61838923ad1100d2db7aa4569) Thanks [@threepointone](https://github.com/threepointone)! - trigger a minor release

## 0.0.13

### Patch Changes

- [#27](https://github.com/cloudflare/workers-ai-provider/pull/27) [`add4120`](https://github.com/cloudflare/workers-ai-provider/commit/add4120ce09714d86917cfa891fb3072cdcbcd00) Thanks [@jiang-zhexin](https://github.com/jiang-zhexin)! - Exclude BaseAiTextToImage model

- [#23](https://github.com/cloudflare/workers-ai-provider/pull/23) [`b15ad06`](https://github.com/cloudflare/workers-ai-provider/commit/b15ad067516ea3504679f8613f9893778e61dfa7) Thanks [@andyjessop](https://github.com/andyjessop)! - Fix streaming output by ensuring that events is only called once per stream

- [#26](https://github.com/cloudflare/workers-ai-provider/pull/26) [`6868be7`](https://github.com/cloudflare/workers-ai-provider/commit/6868be7fc22f4c122c49043445c61eec9f41cfcc) Thanks [@andyjessop](https://github.com/andyjessop)! - configures AI Gateway to work with streamText

## 0.0.12

### Patch Changes

- [#21](https://github.com/cloudflare/workers-ai-provider/pull/21) [`6e71dd2`](https://github.com/cloudflare/workers-ai-provider/commit/6e71dd2ec07f573fac2700a195a8dcffc6a85495) Thanks [@andyjessop](https://github.com/andyjessop)! - Fixes tool calling for generateText

## 0.0.11

### Patch Changes

- [`eddaf37`](https://github.com/cloudflare/workers-ai-provider/commit/eddaf37bbe6c0c06b213a885d7ce2c35989cc564) Thanks [@threepointone](https://github.com/threepointone)! - update dependencies

## 0.0.10

### Patch Changes

- [`d16ae4c`](https://github.com/threepointone/workers-ai-provider/commit/d16ae4caa8bc027604006e05faba9ca8ab4bb09d) Thanks [@threepointone](https://github.com/threepointone)! - update readme

## 0.0.9

### Patch Changes

- [`deacf87`](https://github.com/threepointone/workers-ai-provider/commit/deacf87e184c8e358b29036e48b84e0a7fecc607) Thanks [@threepointone](https://github.com/threepointone)! - fix some types and buffering

## 0.0.8

### Patch Changes

- [`bc6408c`](https://github.com/threepointone/workers-ai-provider/commit/bc6408c907400d9a30532f69cfc9c2bcae4aa930) Thanks [@threepointone](https://github.com/threepointone)! - try another release

## 0.0.7

### Patch Changes

- [`2a470cb`](https://github.com/threepointone/workers-ai-provider/commit/2a470cb49e931efc228bca046fa1247682a49666) Thanks [@threepointone](https://github.com/threepointone)! - publish

## 0.0.6

### Patch Changes

- [`30e7ead`](https://github.com/threepointone/workers-ai-provider/commit/30e7eadef9ec2b6b3d1e6fa1ed9de7e852496397) Thanks [@threepointone](https://github.com/threepointone)! - try to trigger a build

## 0.0.5

### Patch Changes

- [`4e967af`](https://github.com/threepointone/workers-ai-provider/commit/4e967af7a840933983120e03fd3163b15f96c48c) Thanks [@threepointone](https://github.com/threepointone)! - fix readme, stray console log

## 0.0.4

### Patch Changes

- [`66e48bc`](https://github.com/threepointone/workers-ai-provider/commit/66e48bc0bd4765eb056bba9cf94197f911697ab8) Thanks [@threepointone](https://github.com/threepointone)! - 🫧

- [`3e15260`](https://github.com/threepointone/workers-ai-provider/commit/3e15260e4fe0e6d5b06c1f5fa2dd86a668921ba8) Thanks [@threepointone](https://github.com/threepointone)! - fix example

## 0.0.3

### Patch Changes

- [`294c9a9`](https://github.com/threepointone/workers-ai-provider/commit/294c9a9ca48654c0b3ee7686ef19cc5f6f41f0cb) Thanks [@threepointone](https://github.com/threepointone)! - try to do a release
