# Effect Functions Not Yet Analyzed

This document catalogs Effect functions that were **not included** in the initial simplification patterns analysis. These should be revisited for potential additional ESLint rules.

---

## 1. Filtering & Refinement Patterns ⚠️

### Core Filtering

- `filterOrDie` - Filter or die with defect
- `filterOrDieMessage` - Filter or die with message
- `filterOrElse` - Filter with fallback effect
- `filterOrFail` - Filter or fail with error
- `filterEffectOrElse` - Filter with effectful fallback
- `filterEffectOrFail` - Filter with effectful error

### Refinement & Validation

- `liftPredicate` - Lift predicate to Effect
- `validate` - Validate with error accumulation
- `validateWith` - Validate with custom strategy
- `validateAll` - Validate all elements
- `validateFirst` - Validate until first success
- `refineOrDie` - Refine type or die (not found but might exist)

**Potential Patterns:**

- `filter + orElse` → `filterOrElse`
- `filter + orDie` → `filterOrDie`
- Complex validation logic → `validate/validateAll`

---

## 2. Advanced Error Handling 🔥

### Partial Error Catching

- `catchIf` - Catch errors matching predicate
- `catchSome` - Catch with partial handler
- `catchSomeCause` - Catch some causes
- `catchSomeDefect` - Catch some defects
- `catchAllDefect` - Catch all defects
- `catchTag` - Catch by discriminated union tag ✅ (mentioned but not detailed)
- `catchTags` - Catch multiple tags ✅ (mentioned but not detailed)

### Error Transformation

- `orDieWith` - Convert error to defect with mapper
- `sandbox` - Expose full Cause as error
- `unsandbox` - Hide Cause back into error channel
- `parallelErrors` - Convert parallel errors to array

### Error Inspection

- `cause` - Get the Cause of an effect
- `isFailure` - Check if effect failed
- `isSuccess` - Check if effect succeeded

**Potential Patterns:**

- Nested `catchAll` with tag checks → `catchTag/catchTags`
- Manual cause inspection → `sandbox/unsandbox`
- Complex error type narrowing → `catchIf/catchSome`

---

## 3. Loop & Repetition Patterns 🔄

### Basic Repetition

- `forever` - Repeat effect indefinitely ✅ (mentioned)
- `iterate` - Iterate with state transformation
- `loop` - Loop with exit condition
- `repeat` - Repeat with schedule ✅ (mentioned)
- `repeatN` - Repeat N times
- `repeatOrElse` - Repeat with error handler
- `replicate` - Replicate effect N times
- `replicateEffect` - Replicate with index-based effects
- `whileLoop` - Traditional while loop

### Scheduling

- `schedule` - Apply schedule
- `scheduleForked` - Schedule in forked fiber
- `scheduleFrom` - Schedule from specific time

**Potential Patterns:**

- Manual loop with state → `iterate/loop`
- Repeated execution → `repeatN/replicate`
- Complex retry logic → `retry` with schedules

---

## 4. Resource Management & Scoping 🔒

### Acquisition & Release

- `acquireRelease` - Acquire resource with finalizer ✅ (mentioned)
- `acquireReleaseInterruptible` - Interruptible acquisition
- `acquireUseRelease` - Acquire, use, release pattern
- `addFinalizer` - Add finalizer to scope
- `ensuring` - Run finalizer regardless of outcome
- `onError` - Run effect on error
- `onExit` - Run effect on exit
- `using` - Use a resource with automatic release
- `withEarlyRelease` - Manual early release

### Scope Management

- `scope` - Get current scope
- `scopeWith` - Use current scope
- `scopedWith` - Execute in scope
- `scoped` - Make effect scoped
- `finalizersMask` - Control finalizer execution
- `parallelFinalizers` - Run finalizers in parallel
- `sequentialFinalizers` - Run finalizers sequentially

**Potential Patterns:**

- Manual try/finally → `acquireRelease/ensuring`
- Nested resource management → `using`

---

## 5. Concurrency & Parallelism 🚀

### Forking & Fibers

- `fork` - Fork into new fiber ✅ (mentioned)
- `forkDaemon` - Fork as daemon ✅ (mentioned)
- `forkAll` - Fork multiple effects
- `forkIn` - Fork in specific scope
- `forkScoped` - Fork with scope
- `forkWithErrorHandler` - Fork with error handler
- `fromFiber` - Create effect from fiber
- `fromFiberEffect` - Create from fiber effect
- `supervised` - Supervise child fibers

### Child Fiber Management

- `awaitAllChildren` - Wait for all children
- `daemonChildren` - Make children daemon
- `ensuringChild` - Ensure child completion
- `ensuringChildren` - Ensure children completion

### Concurrency Control

- `withConcurrency` - Set concurrency level
- `withScheduler` - Set custom scheduler
- `withSchedulingPriority` - Set priority
- `withMaxOpsBeforeYield` - Control yielding

### Racing

- `race` - Race two effects ✅ (mentioned)
- `raceAll` - Race multiple effects
- `raceFirst` - Race and return first
- `raceWith` - Race with custom merger

**Potential Patterns:**

- Complex fork+join → `forkAll`
- Manual fiber management → helper functions

---

## 6. Timing & Delays ⏱️

### Time Operations

- `sleep` - Sleep for duration
- `delay` - Delay effect execution ✅ (mentioned)
- `timed` - Measure execution time
- `timedWith` - Measure with custom clock
- `timeout` - Add timeout ✅ (mentioned)
- `timeoutOption` - Timeout returning Option
- `timeoutFail` - Timeout with custom error
- `timeoutFailCause` - Timeout with custom cause
- `timeoutTo` - Timeout with fallback value

**Potential Patterns:**

- Manual timing logic → `timed`
- Complex timeout handling → `timeoutOption/timeoutTo`

---

## 7. Context & Services 🔌

### Context Access

- `context` - Get full context
- `contextWith` - Use context
- `contextWithEffect` - Use context effectfully
- `mapInputContext` - Transform context
- `provide` - Provide context ✅ (mentioned)
- `provideService` - Provide single service
- `provideServiceEffect` - Provide service from effect

### Service Utilities

- `serviceFunction` - Create service function
- `serviceFunctionEffect` - Create effectful service function
- `serviceFunctions` - Extract all service functions
- `serviceConstants` - Extract service constants
- `serviceMembers` - Extract all service members
- `serviceOption` - Get optional service
- `serviceOptional` - Get service or fail
- `updateService` - Update service in context

### Provider Configuration

- `withConfigProvider` - Set config provider
- `withConfigProviderScoped` - Scoped config provider
- `configProviderWith` - Use config provider

**Potential Patterns:**

- Manual context threading → `provide/provideService`
- Service extraction → `serviceMembers/serviceFunctions`

---

## 8. Interruption Handling ⛔

### Interruption Control

- `interrupt` - Interrupt current fiber
- `interruptWith` - Interrupt with specific fiber ID
- `interruptible` - Mark as interruptible
- `interruptibleMask` - Interruptible with restore
- `uninterruptible` - Mark as uninterruptible ✅ (mentioned)
- `uninterruptibleMask` - Uninterruptible with restore
- `onInterrupt` - Run effect on interruption
- `disconnect` - Disconnect from parent
- `checkInterruptible` - Check interruption status
- `allowInterrupt` - Allow interruption point

**Potential Patterns:**

- Critical sections → `uninterruptible`
- Cleanup on interrupt → `onInterrupt`

---

## 9. Fiber References (FiberRef) 📝

### FiberRef Operations

- `getFiberRefs` - Get all fiber refs
- `setFiberRefs` - Set all fiber refs
- `updateFiberRefs` - Update fiber refs
- `inheritFiberRefs` - Inherit from child
- `patchFiberRefs` - Apply patch
- `diffFiberRefs` - Get diff

### Local State

- `locally` - Set locally
- `locallyWith` - Set locally with function
- `locallyScoped` - Scoped local
- `locallyScopedWith` - Scoped local with function
- `whenFiberRef` - Conditional on FiberRef value
- `whenRef` - Conditional on Ref value

**Potential Patterns:**

- Manual FiberRef management → helper functions
- Thread-local state → `locally/locallyScoped`

---

## 10. Logging & Debugging 📊

### Logging Functions

- `log` - Log message
- `logTrace` - Log at trace level
- `logDebug` - Log at debug level
- `logInfo` - Log at info level
- `logWarning` - Log at warning level
- `logError` - Log at error level
- `logFatal` - Log at fatal level
- `logWithLevel` - Log with custom level

### Log Annotations

- `withLogSpan` - Add log span
- `annotateLogs` - Annotate logs
- `annotateLogsScoped` - Scoped log annotations
- `logAnnotations` - Get log annotations
- `withUnhandledErrorLogLevel` - Set unhandled error level
- `whenLogLevel` - Conditional based on log level

**Potential Patterns:**

- Console.log → `Effect.log*`
- Complex logging setup → annotation functions

---

## 11. Tracing & Metrics 📈

### Tracing

- `tracer` - Get tracer
- `tracerWith` - Use tracer
- `withTracer` - Set tracer
- `withTracerScoped` - Scoped tracer
- `withTracerEnabled` - Enable/disable tracing
- `withTracerTiming` - Control timing
- `annotateSpans` - Annotate trace spans
- `annotateCurrentSpan` - Annotate current span

### Metrics

- `tagMetrics` - Tag metrics
- `labelMetrics` - Label metrics
- `tagMetricsScoped` - Scoped metric tags
- `labelMetricsScoped` - Scoped metric labels
- `metricLabels` - Get metric labels
- `withMetric` - Apply metric

**Potential Patterns:**

- Manual metrics → `withMetric`
- Tracing setup → annotation functions

---

## 12. Clock & Time Services ⏰

### Clock Access

- `clock` - Get clock service
- `clockWith` - Use clock
- `withClock` - Set custom clock
- `withClockScoped` - Scoped clock

**Potential Patterns:**

- Manual time tracking → use Clock service

---

## 13. Console Service 🖥️

### Console Access

- `console` - Get console service
- `consoleWith` - Use console
- `withConsole` - Set console
- `withConsoleScoped` - Scoped console

**Potential Patterns:**

- Direct console usage → Console service

---

## 14. Random Service 🎲

### Random Access

- `random` - Get random service
- `randomWith` - Use random
- `withRandom` - Set random
- `withRandomFixed` - Fixed random seed
- `withRandomScoped` - Scoped random

**Potential Patterns:**

- Math.random() → Random service
- Deterministic testing → `withRandomFixed`

---

## 15. Runtime & Execution 🏃

### Runtime Access

- `runtime` - Get runtime
- `getRuntimeFlags` - Get runtime flags
- `patchRuntimeFlags` - Patch runtime flags
- `withRuntimeFlagsPatch` - Apply flags patch
- `withRuntimeFlagsPatchScoped` - Scoped flags patch
- `withExecutionPlan` - Set execution plan

### Running Effects

- `runFork` - Run and fork
- `runCallback` - Run with callback
- `runPromise` - Run to Promise ✅ (mentioned)
- `runPromiseExit` - Run to Exit
- `runSync` - Run synchronously
- `runSyncExit` - Run to Exit synchronously

**Potential Patterns:**

- Manual execution → `run*` functions

---

## 16. Advanced Composition 🔗

### Sequencing Variants

- `summarized` - Run with before/after summary
- `transplant` - Transplant fiber parentage
- `custom` - Custom effect construction
- `withFiberRuntime` - Access fiber runtime

### Matching/Branching

- `match` - Pattern match on result ✅ (covered in Match module)
- `matchCause` - Pattern match on cause
- `matchEffect` - Effectful pattern match
- `matchCauseEffect` - Effectful cause match

### Transformation

- `flip` - Swap error/success ✅ (mentioned)
- `flipWith` - Swap and transform
- `merge` - Merge error/success channels
- `negate` - Negate boolean result

**Potential Patterns:**

- Complex branching → `match*` functions
- Channel manipulation → `flip/merge`

---

## 17. Collection Operations 📦

### Already in Main Document ✅

- `all` / `allWith` - Combine effects
- `forEach` - Map with effects
- `filter` - Filter with predicate
- `partition` - Partition with predicate

### Additional Collection Ops

- `allSuccesses` - Collect successes, ignore errors
- `dropUntil` - Drop until predicate
- `dropWhile` - Drop while predicate
- `takeUntil` - Take until predicate
- `takeWhile` - Take while predicate
- `every` - Check if all satisfy
- `exists` - Check if any satisfies
- `findFirst` - Find first match
- `head` - Get first element
- `mergeAll` - Merge all with strategy
- `reduce` - Reduce collection
- `reduceRight` - Reduce from right
- `reduceWhile` - Reduce with condition
- `reduceEffect` - Effectful reduce

**Potential Patterns:**

- Manual collection traversal → collection helpers
- Complex filtering → `takeWhile/dropWhile`

---

## 18. Effect Construction 🏗️

### Async Construction

- `async` - Create async effect
- `asyncEffect` - Create async with cleanup
- `promise` - From Promise ✅ (mentioned)
- `tryPromise` - From Promise with error mapping
- `tryMap` - Try with error mapping
- `tryMapPromise` - Try promise with error mapping

### Sync Construction

- `succeed` - Success value ✅ (mentioned)
- `sync` - Lazy synchronous
- `suspend` - Lazy effect ✅ (mentioned)
- `fail` - Failure ✅ (mentioned)
- `failSync` - Lazy failure
- `die` - Defect
- `dieSync` - Lazy defect
- `dieMessage` - Defect with message
- `never` - Never-completing effect
- `yieldNow` - Yield execution

### Generator Support

- `gen` - Generator syntax ✅ (mentioned)

**Potential Patterns:**

- Promise callbacks → `tryPromise`
- Manual async → `async/asyncEffect`

---

## 19. Special Purpose 🎯

### Do Notation

- `Do` - Start Do notation
- `bind` - Bind in Do notation
- `bindAll` - Bind multiple
- `bindTo` - Bind to name

### Request Handling

- `request` - Make request
- `cacheRequestResult` - Cache request result
- `withRequestBatching` - Enable batching
- `withRequestCaching` - Enable caching
- `withRequestCache` - Use custom cache
- `blocked` - Create blocked effect
- `runRequestBlock` - Run request block
- `step` - Step through execution

### Synchronization

- `unsafeMakeSemaphore` - Create semaphore (unsafe)
- `makeSemaphore` - Create semaphore
- `unsafeMakeLatch` - Create latch (unsafe)
- `makeLatch` - Create latch

### Descriptors

- `descriptor` - Get fiber descriptor
- `descriptorWith` - Use fiber descriptor
- `fiberId` - Get fiber ID
- `fiberIdWith` - Use fiber ID

### Eventually & Retry

- `eventually` - Retry until success

**Potential Patterns:**

- Do notation could replace complex `flatMap` chains
- Request optimization → batching/caching

---

## 20. Type Conversions & Outcome Handling 🔄

### Conversions (Already Covered ✅)

- `option` - To Option
- `either` - To Either
- `exit` - To Exit
- `intoDeferred` - Into Deferred

### None Handling (Already Covered ✅)

- `none` - Filter Option.none

**Potential Patterns:**

- Manual Option/Either conversion → helpers

---

## Summary Statistics

**Total Functions in Effect Module:** ~250+

**Already Analyzed:** ~25 patterns

**Not Yet Analyzed:** ~225+ functions

### Breakdown by Priority for Future Analysis:

**High Priority** (Most likely to have useful patterns):

1. Filtering & Refinement (~10 functions)
2. Advanced Error Handling (~10 functions)
3. Loop & Repetition (~10 functions)
4. Collection Operations (~15 functions)

**Medium Priority** (Useful but more specialized):

1. Resource Management (~15 functions)
2. Concurrency & Parallelism (~15 functions)
3. Context & Services (~15 functions)
4. Timing & Delays (~10 functions)

**Lower Priority** (Very specialized or advanced):

1. Interruption Handling (~10 functions)
2. FiberRef Operations (~10 functions)
3. Logging & Debugging (~15 functions)
4. Tracing & Metrics (~10 functions)
5. Runtime & Execution (~10 functions)
6. Request Handling (~5 functions)

## Next Steps

1. Start with **High Priority** categories
2. Look for common patterns where developers use verbose approaches
3. Check Effect Discord/GitHub for common pain points
4. Analyze real codebases for actual usage patterns
5. Prioritize rules with high impact and clear auto-fix potential

## Notes

- Many of these functions are about setting up infrastructure rather than simplifying patterns
- Focus should be on functions that replace **common verbose patterns**
- Some functions (like services, tracing) might not need simplification rules but rather usage guidance
- The **Do notation** and **gen** syntax might deserve special attention as they replace entire patterns
