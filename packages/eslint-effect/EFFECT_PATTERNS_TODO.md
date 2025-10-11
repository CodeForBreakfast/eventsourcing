# Effect Simplification Patterns - Implementation Checklist

## High Priority (Already Analyzed - 25 patterns)

- [ ] `prefer-as` - `map(() => value)` → `as(value)` (Effect, Option, Stream, Schedule, Channel, STM, Sink, Cause)
- [x] `prefer-as-void` - `map(() => void)` → `asVoid` (Effect, Option)
- [ ] `prefer-as-some` - `map(Option.some)` → `asSome` (Effect)
- [ ] `prefer-as-some-error` - `mapError(Option.some)` → `asSomeError` (Effect)
- [ ] `prefer-flatten` - `flatMap(identity)` → `flatten` (Effect, Option, Array, Cause, STM)
- [ ] `prefer-zip-left` - `flatMap(a => map(b, () => a))` → `zipLeft(a, b)` (Effect, Option)
- [ ] `prefer-zip-right` - `flatMap(() => b)` → `zipRight(a, b)` (Effect, Option)
- [ ] `prefer-ignore` - Complex ignore pattern → `ignore` (Effect)
- [ ] `prefer-ignore-logged` - Ignore with logging → `ignoreLogged` (Effect)
- [ ] `prefer-from-nullable` - `value != null ? some(value) : none()` → `fromNullable(value)` (Option)
- [ ] `prefer-get-or-else` - `isSome(opt) ? opt.value : default` → `getOrElse(() => default)` (Option)
- [ ] `prefer-get-or-null` - `getOrElse(() => null)` → `getOrNull` (Option)
- [ ] `prefer-get-or-undefined` - `getOrElse(() => undefined)` → `getOrUndefined` (Option)
- [ ] `prefer-head` - `get(0)` → `head` (Array)
- [ ] `prefer-get-somes` - `filter(Option.isSome).map(x => x.value)` → `getSomes` (Array)
- [ ] `prefer-get-rights` - `filter(Either.isRight).map(x => x.right)` → `getRights` (Array)
- [ ] `prefer-get-lefts` - `filter(Either.isLeft).map(x => x.left)` → `getLefts` (Array)
- [ ] `prefer-succeed-none` - `succeed(Option.none())` → `succeedNone` (Effect)
- [ ] `prefer-succeed-some` - `succeed(Option.some(x))` → `succeedSome(x)` (Effect)
- [ ] `prefer-when` - `condition ? effect : void` → `when(effect, () => condition)` (Effect)
- [ ] `prefer-unless` - `!condition ? effect : void` → `unless(effect, () => condition)` (Effect)
- [ ] `prefer-match-value` - Nested ternaries → `Match.value` (Match)
- [ ] `prefer-match-tags` - `switch(value._tag)` → `Match.tags` (Match)
- [ ] `prefer-and-then` - Simple `flatMap(() => x)` → `andThen(x)` (Effect)
- [ ] `prefer-tap` - `flatMap(v => map(fx, () => v))` → `tap(fx)` (Effect)
- [ ] `prefer-tap-error` - `catchAll(e => flatMap(fx, () => fail(e)))` → `tapError(fx)` (Effect)
- [ ] `prefer-tap-both` - `tap` + `tapError` → `tapBoth` (Effect)

## Filtering & Refinement Patterns (10 functions)

- [ ] `filterOrDie` - Filter or die with defect
- [ ] `filterOrDieMessage` - Filter or die with message
- [ ] `filterOrElse` - Filter with fallback effect
- [ ] `filterOrFail` - Filter or fail with error
- [ ] `filterEffectOrElse` - Filter with effectful fallback
- [ ] `filterEffectOrFail` - Filter with effectful error
- [ ] `liftPredicate` - Lift predicate to Effect
- [ ] `validate` - Validate with error accumulation
- [ ] `validateWith` - Validate with custom strategy
- [ ] `validateAll` - Validate all elements
- [ ] `validateFirst` - Validate until first success

## Advanced Error Handling (22 functions)

- [ ] `catchIf` - Catch errors matching predicate
- [ ] `catchSome` - Catch with partial handler
- [ ] `catchSomeCause` - Catch some causes
- [ ] `catchSomeDefect` - Catch some defects
- [ ] `catchAllDefect` - Catch all defects
- [ ] `catchTag` - Catch by discriminated union tag
- [ ] `catchTags` - Catch multiple tags
- [ ] `orDieWith` - Convert error to defect with mapper
- [ ] `sandbox` - Expose full Cause as error
- [ ] `unsandbox` - Hide Cause back into error channel
- [ ] `parallelErrors` - Convert parallel errors to array
- [ ] `cause` - Get the Cause of an effect
- [ ] `isFailure` - Check if effect failed
- [ ] `isSuccess` - Check if effect succeeded

## Loop & Repetition Patterns (16 functions)

- [ ] `forever` - Repeat effect indefinitely
- [ ] `iterate` - Iterate with state transformation
- [ ] `loop` - Loop with exit condition
- [ ] `repeat` - Repeat with schedule
- [ ] `repeatN` - Repeat N times
- [ ] `repeatOrElse` - Repeat with error handler
- [ ] `replicate` - Replicate effect N times
- [ ] `replicateEffect` - Replicate with index-based effects
- [ ] `whileLoop` - Traditional while loop
- [ ] `schedule` - Apply schedule
- [ ] `scheduleForked` - Schedule in forked fiber
- [ ] `scheduleFrom` - Schedule from specific time

## Resource Management & Scoping (18 functions)

- [ ] `acquireRelease` - Acquire resource with finalizer
- [ ] `acquireReleaseInterruptible` - Interruptible acquisition
- [ ] `acquireUseRelease` - Acquire, use, release pattern
- [ ] `addFinalizer` - Add finalizer to scope
- [ ] `ensuring` - Run finalizer regardless of outcome
- [ ] `onError` - Run effect on error
- [ ] `onExit` - Run effect on exit
- [ ] `using` - Use a resource with automatic release
- [ ] `withEarlyRelease` - Manual early release
- [ ] `scope` - Get current scope
- [ ] `scopeWith` - Use current scope
- [ ] `scopedWith` - Execute in scope
- [ ] `scoped` - Make effect scoped
- [ ] `finalizersMask` - Control finalizer execution
- [ ] `parallelFinalizers` - Run finalizers in parallel
- [ ] `sequentialFinalizers` - Run finalizers sequentially

## Concurrency & Parallelism (26 functions)

- [ ] `fork` - Fork into new fiber
- [ ] `forkDaemon` - Fork as daemon
- [ ] `forkAll` - Fork multiple effects
- [ ] `forkIn` - Fork in specific scope
- [ ] `forkScoped` - Fork with scope
- [ ] `forkWithErrorHandler` - Fork with error handler
- [ ] `fromFiber` - Create effect from fiber
- [ ] `fromFiberEffect` - Create from fiber effect
- [ ] `supervised` - Supervise child fibers
- [ ] `awaitAllChildren` - Wait for all children
- [ ] `daemonChildren` - Make children daemon
- [ ] `ensuringChild` - Ensure child completion
- [ ] `ensuringChildren` - Ensure children completion
- [ ] `withConcurrency` - Set concurrency level
- [ ] `withScheduler` - Set custom scheduler
- [ ] `withSchedulingPriority` - Set priority
- [ ] `withMaxOpsBeforeYield` - Control yielding
- [ ] `race` - Race two effects
- [ ] `raceAll` - Race multiple effects
- [ ] `raceFirst` - Race and return first
- [ ] `raceWith` - Race with custom merger

## Timing & Delays (10 functions)

- [ ] `sleep` - Sleep for duration
- [ ] `delay` - Delay effect execution
- [ ] `timed` - Measure execution time
- [ ] `timedWith` - Measure with custom clock
- [ ] `timeout` - Add timeout
- [ ] `timeoutOption` - Timeout returning Option
- [ ] `timeoutFail` - Timeout with custom error
- [ ] `timeoutFailCause` - Timeout with custom cause
- [ ] `timeoutTo` - Timeout with fallback value

## Context & Services (22 functions)

- [ ] `context` - Get full context
- [ ] `contextWith` - Use context
- [ ] `contextWithEffect` - Use context effectfully
- [ ] `mapInputContext` - Transform context
- [ ] `provide` - Provide context
- [ ] `provideService` - Provide single service
- [ ] `provideServiceEffect` - Provide service from effect
- [ ] `serviceFunction` - Create service function
- [ ] `serviceFunctionEffect` - Create effectful service function
- [ ] `serviceFunctions` - Extract all service functions
- [ ] `serviceConstants` - Extract service constants
- [ ] `serviceMembers` - Extract all service members
- [ ] `serviceOption` - Get optional service
- [ ] `serviceOptional` - Get service or fail
- [ ] `updateService` - Update service in context
- [ ] `withConfigProvider` - Set config provider
- [ ] `withConfigProviderScoped` - Scoped config provider
- [ ] `configProviderWith` - Use config provider

## Interruption Handling (11 functions)

- [ ] `interrupt` - Interrupt current fiber
- [ ] `interruptWith` - Interrupt with specific fiber ID
- [ ] `interruptible` - Mark as interruptible
- [ ] `interruptibleMask` - Interruptible with restore
- [ ] `uninterruptible` - Mark as uninterruptible
- [ ] `uninterruptibleMask` - Uninterruptible with restore
- [ ] `onInterrupt` - Run effect on interruption
- [ ] `disconnect` - Disconnect from parent
- [ ] `checkInterruptible` - Check interruption status
- [ ] `allowInterrupt` - Allow interruption point

## Fiber References (12 functions)

- [ ] `getFiberRefs` - Get all fiber refs
- [ ] `setFiberRefs` - Set all fiber refs
- [ ] `updateFiberRefs` - Update fiber refs
- [ ] `inheritFiberRefs` - Inherit from child
- [ ] `patchFiberRefs` - Apply patch
- [ ] `diffFiberRefs` - Get diff
- [ ] `locally` - Set locally
- [ ] `locallyWith` - Set locally with function
- [ ] `locallyScoped` - Scoped local
- [ ] `locallyScopedWith` - Scoped local with function
- [ ] `whenFiberRef` - Conditional on FiberRef value
- [ ] `whenRef` - Conditional on Ref value

## Logging & Debugging (16 functions)

- [ ] `log` - Log message
- [ ] `logTrace` - Log at trace level
- [ ] `logDebug` - Log at debug level
- [ ] `logInfo` - Log at info level
- [ ] `logWarning` - Log at warning level
- [ ] `logError` - Log at error level
- [ ] `logFatal` - Log at fatal level
- [ ] `logWithLevel` - Log with custom level
- [ ] `withLogSpan` - Add log span
- [ ] `annotateLogs` - Annotate logs
- [ ] `annotateLogsScoped` - Scoped log annotations
- [ ] `logAnnotations` - Get log annotations
- [ ] `withUnhandledErrorLogLevel` - Set unhandled error level
- [ ] `whenLogLevel` - Conditional based on log level

## Tracing & Metrics (14 functions)

- [ ] `tracer` - Get tracer
- [ ] `tracerWith` - Use tracer
- [ ] `withTracer` - Set tracer
- [ ] `withTracerScoped` - Scoped tracer
- [ ] `withTracerEnabled` - Enable/disable tracing
- [ ] `withTracerTiming` - Control timing
- [ ] `annotateSpans` - Annotate trace spans
- [ ] `annotateCurrentSpan` - Annotate current span
- [ ] `tagMetrics` - Tag metrics
- [ ] `labelMetrics` - Label metrics
- [ ] `tagMetricsScoped` - Scoped metric tags
- [ ] `labelMetricsScoped` - Scoped metric labels
- [ ] `metricLabels` - Get metric labels
- [ ] `withMetric` - Apply metric

## Clock & Time Services (4 functions)

- [ ] `clock` - Get clock service
- [ ] `clockWith` - Use clock
- [ ] `withClock` - Set custom clock
- [ ] `withClockScoped` - Scoped clock

## Console Service (4 functions)

- [ ] `console` - Get console service
- [ ] `consoleWith` - Use console
- [ ] `withConsole` - Set console
- [ ] `withConsoleScoped` - Scoped console

## Random Service (5 functions)

- [ ] `random` - Get random service
- [ ] `randomWith` - Use random
- [ ] `withRandom` - Set random
- [ ] `withRandomFixed` - Fixed random seed
- [ ] `withRandomScoped` - Scoped random

## Runtime & Execution (13 functions)

- [ ] `runtime` - Get runtime
- [ ] `getRuntimeFlags` - Get runtime flags
- [ ] `patchRuntimeFlags` - Patch runtime flags
- [ ] `withRuntimeFlagsPatch` - Apply flags patch
- [ ] `withRuntimeFlagsPatchScoped` - Scoped flags patch
- [ ] `withExecutionPlan` - Set execution plan
- [ ] `runFork` - Run and fork
- [ ] `runCallback` - Run with callback
- [ ] `runPromise` - Run to Promise
- [ ] `runPromiseExit` - Run to Exit
- [ ] `runSync` - Run synchronously
- [ ] `runSyncExit` - Run to Exit synchronously

## Advanced Composition (12 functions)

- [ ] `summarized` - Run with before/after summary
- [ ] `transplant` - Transplant fiber parentage
- [ ] `custom` - Custom effect construction
- [ ] `withFiberRuntime` - Access fiber runtime
- [ ] `match` - Pattern match on result
- [ ] `matchCause` - Pattern match on cause
- [ ] `matchEffect` - Effectful pattern match
- [ ] `matchCauseEffect` - Effectful cause match
- [ ] `flip` - Swap error/success
- [ ] `flipWith` - Swap and transform
- [ ] `merge` - Merge error/success channels
- [ ] `negate` - Negate boolean result

## Collection Operations (17 functions)

- [ ] `allSuccesses` - Collect successes, ignore errors
- [ ] `dropUntil` - Drop until predicate
- [ ] `dropWhile` - Drop while predicate
- [ ] `takeUntil` - Take until predicate
- [ ] `takeWhile` - Take while predicate
- [ ] `every` - Check if all satisfy
- [ ] `exists` - Check if any satisfies
- [ ] `findFirst` - Find first match
- [ ] `head` - Get first element
- [ ] `mergeAll` - Merge all with strategy
- [ ] `reduce` - Reduce collection
- [ ] `reduceRight` - Reduce from right
- [ ] `reduceWhile` - Reduce with condition
- [ ] `reduceEffect` - Effectful reduce

## Effect Construction (17 functions)

- [ ] `async` - Create async effect
- [ ] `asyncEffect` - Create async with cleanup
- [ ] `promise` - From Promise
- [ ] `tryPromise` - From Promise with error mapping
- [ ] `tryMap` - Try with error mapping
- [ ] `tryMapPromise` - Try promise with error mapping
- [ ] `succeed` - Success value
- [ ] `sync` - Lazy synchronous
- [ ] `suspend` - Lazy effect
- [ ] `fail` - Failure
- [ ] `failSync` - Lazy failure
- [ ] `die` - Defect
- [ ] `dieSync` - Lazy defect
- [ ] `dieMessage` - Defect with message
- [ ] `never` - Never-completing effect
- [ ] `yieldNow` - Yield execution
- [ ] `gen` - Generator syntax

## Special Purpose (15 functions)

- [ ] `Do` - Start Do notation
- [ ] `bind` - Bind in Do notation
- [ ] `bindAll` - Bind multiple
- [ ] `bindTo` - Bind to name
- [ ] `request` - Make request
- [ ] `cacheRequestResult` - Cache request result
- [ ] `withRequestBatching` - Enable batching
- [ ] `withRequestCaching` - Enable caching
- [ ] `withRequestCache` - Use custom cache
- [ ] `blocked` - Create blocked effect
- [ ] `runRequestBlock` - Run request block
- [ ] `step` - Step through execution
- [ ] `descriptor` - Get fiber descriptor
- [ ] `descriptorWith` - Use fiber descriptor
- [ ] `fiberId` - Get fiber ID
- [ ] `fiberIdWith` - Use fiber ID
- [ ] `eventually` - Retry until success

## Summary

**Total patterns: 277**

- Already Analyzed: 27 (1 completed: prefer-as-void)
- Not Yet Analyzed: 250
