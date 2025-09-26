/**
 * Usage Pattern Examples - When to Use Each Command Type
 *
 * This demonstrates the decision matrix for choosing between:
 * - WireCommand: External/untrusted data requiring validation
 * - LocalCommand: Internal/trusted data with compile-time safety
 * - Direct Aggregate Access: Maximum performance for simple operations
 */

import { Effect, pipe } from 'effect';
import { WireCommand, LocalCommand, localCommand, DomainCommand } from './commands';

// ============================================================================
// Decision Matrix Examples
// ============================================================================

/**
 * Pattern 1: External API Endpoints → WireCommand
 *
 * Use WireCommand when:
 * ✅ Data comes from external sources (HTTP, WebSocket, queue)
 * ✅ Validation is required (untrusted input)
 * ✅ Serialization/deserialization needed
 * ✅ Full audit trail required
 */
export const externalApiPattern = () => {
  // HTTP request handler
  const handleApiRequest = (httpBody: unknown) => {
    // Unknown data from external client
    const wireCommand: WireCommand = {
      id: crypto.randomUUID(),
      target: 'user-123',
      name: 'CreateUser',
      payload: httpBody, // Could be anything!
    };

    // Full validation pipeline handles unknown data
    console.log('🌐 API Request → WireCommand → Validation → Handler');
    return wireCommand;
  };

  return handleApiRequest({ email: 'api@example.com', name: 'API User' });
};

/**
 * Pattern 2: Internal Service Communication → LocalCommand
 *
 * Use LocalCommand when:
 * ✅ Same process/trusted environment
 * ✅ Compile-time type safety
 * ✅ No serialization overhead
 * ✅ Still want command audit trails
 */
export const internalServicePattern = () => {
  interface CreateUserPayload {
    email: string;
    name: string;
  }

  const processInternalRequest = (userData: CreateUserPayload) => {
    // Type-safe, no runtime validation needed
    const command = localCommand(
      crypto.randomUUID(),
      'user-456',
      'CreateUser',
      userData // Fully typed at compile time
    );

    console.log('🏠 Internal Service → LocalCommand → Skip Validation → Handler');
    return command;
  };

  return processInternalRequest({ email: 'internal@example.com', name: 'Internal User' });
};

/**
 * Pattern 3: Direct Aggregate Access
 *
 * Use Direct Aggregate when:
 * ✅ Maximum performance needed
 * ✅ Complex multi-aggregate workflows
 * ✅ Simple CRUD-like operations
 * ✅ Command patterns add unnecessary overhead
 */
export const directAggregatePattern = () => {
  // Simulated aggregate with direct functions
  const UserAggregate = {
    createUser: (email: string, name: string) =>
      pipe(
        Effect.sync(() => {
          console.log('⚡ Direct Aggregate → No Command Layer → Maximum Performance');
          return [
            {
              type: 'UserCreated' as const,
              userId: crypto.randomUUID(),
              email,
              name,
            },
          ];
        })
      ),

    updateEmail: (userId: string, newEmail: string) =>
      pipe(
        Effect.sync(() => [
          {
            type: 'UserEmailUpdated' as const,
            userId,
            newEmail,
            updatedAt: new Date(),
          },
        ])
      ),
  };

  return UserAggregate.createUser('direct@example.com', 'Direct User');
};

// ============================================================================
// Real-World Scenarios
// ============================================================================

/**
 * Scenario: E-commerce Order Processing
 */
export const ecommerceScenarios = {
  // External customer places order → WireCommand
  customerPlacesOrder: () => {
    const wireCommand: WireCommand = {
      id: crypto.randomUUID(),
      target: 'order-123',
      name: 'PlaceOrder',
      payload: {
        customerId: 'cust-456',
        items: [
          { productId: 'prod-789', quantity: 2 },
          { productId: 'prod-101', quantity: 1 },
        ],
        shippingAddress: {
          street: '123 Main St',
          city: 'Anytown',
          zipCode: '12345',
        },
      },
    };

    console.log('🛒 Customer Order (External) → WireCommand + Validation');
    return wireCommand;
  },

  // Internal inventory service reserves stock → LocalCommand
  inventoryReservesStock: () => {
    const command = localCommand(crypto.randomUUID(), 'inventory-456', 'ReserveStock', {
      orderId: 'order-123',
      reservations: [
        { productId: 'prod-789', quantity: 2 },
        { productId: 'prod-101', quantity: 1 },
      ],
    });

    console.log('📦 Inventory Service (Internal) → LocalCommand');
    return command;
  },

  // High-frequency price updates → Direct Aggregate
  updateProductPrices: () => {
    const ProductAggregate = {
      updatePrice: (productId: string, newPrice: number) =>
        pipe(
          Effect.sync(() => [
            {
              type: 'ProductPriceUpdated' as const,
              productId,
              newPrice,
              updatedAt: new Date(),
            },
          ])
        ),
    };

    console.log('💰 Price Updates (High Frequency) → Direct Aggregate');
    return ProductAggregate.updatePrice('prod-789', 29.99);
  },
};

/**
 * Scenario: Complex Workflow Combining All Patterns
 */
export const complexWorkflowScenario = () =>
  pipe(
    Effect.all([
      // Step 1: External order (WireCommand)
      Effect.succeed(ecommerceScenarios.customerPlacesOrder()),

      // Step 2: Internal inventory check (LocalCommand)
      Effect.succeed(ecommerceScenarios.inventoryReservesStock()),

      // Step 3: Direct aggregate operations (performance-critical)
      ecommerceScenarios.updateProductPrices(),
    ]),
    Effect.tap(([wireCmd, localCmd, events]) =>
      Effect.sync(() => {
        console.log('\n🔄 Complex Workflow Complete:');
        console.log(`   • External Command: ${wireCmd.name}`);
        console.log(`   • Internal Command: ${localCmd.name}`);
        console.log(`   • Direct Events: ${events.length} generated`);
      })
    )
  );

// ============================================================================
// Performance Characteristics
// ============================================================================

/**
 * Performance comparison demonstration
 */
export const performanceComparison = () => {
  console.log('\n⚡ Performance Characteristics:');
  console.log('');
  console.log('🌐 WireCommand:');
  console.log('   • Runtime validation (schema parsing)');
  console.log('   • Serialization/deserialization');
  console.log('   • Full audit trail');
  console.log('   • Highest latency, maximum safety');
  console.log('');
  console.log('🏠 LocalCommand:');
  console.log('   • Compile-time validation only');
  console.log('   • No serialization overhead');
  console.log('   • Audit trail preserved');
  console.log('   • Medium latency, good balance');
  console.log('');
  console.log('⚡ Direct Aggregate:');
  console.log('   • No command layer overhead');
  console.log('   • Direct function calls');
  console.log('   • No built-in audit trail');
  console.log('   • Lowest latency, maximum performance');
};

// ============================================================================
// Migration Strategy
// ============================================================================

/**
 * How to migrate between patterns as requirements change
 */
export const migrationStrategy = () => {
  console.log('\n🔄 Migration Paths:');
  console.log('');
  console.log('Direct Aggregate → LocalCommand:');
  console.log('   • Add command audit requirements');
  console.log('   • Wrap direct calls in localCommand()');
  console.log('   • Minimal code changes');
  console.log('');
  console.log('LocalCommand → WireCommand:');
  console.log('   • Add external API endpoints');
  console.log('   • Create validation schemas');
  console.log('   • Same handlers work for both');
  console.log('');
  console.log('WireCommand → LocalCommand:');
  console.log('   • Move to internal-only usage');
  console.log('   • Remove validation overhead');
  console.log('   • Keep audit capabilities');
};
