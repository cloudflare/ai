# Restaurant Intelligence Platform

A comprehensive AI-powered restaurant operations analytics and automation platform built with Next.js 15.2+, featuring real-time data integration, advanced analytics, and intelligent workflow automation.

## Core Features

### Schema Transformation Engine
- Multi-format support: JSON Schema, Zod, GraphQL, Cypher, Pydantic, TypeScript
- Restaurant industry templates for Toast POS, OpenTable, and 7Shifts
- AI-powered optimization with validation and best practices

### Workflow Generator
- TRIZ Innovation Principles: 40 systematic innovation principles applied to workflows
- Agentic Flows: Robust workflows with error handling and performance optimization
- Meta-prompt Engineering: Advanced AI prompting for workflow generation
- Template Library: Pre-built workflows for ETL, canonicalization, and feature engineering

### Knowledge Graph Builder
- Temporal & Spatial Modeling: Time-based and location-based relationships
- Hypergraph Support: Multi-node relationships and complex interactions
- Event Knowledge Graphs: Restaurant operations analytics with causal modeling
- Real-time Analytics: Community detection, pattern finding, and link prediction

### Data Canonicalizer
- Multi-source Integration: JSON, CSV, XML, YAML, SQL formats
- Validation & Enrichment: Comprehensive data quality and enhancement
- Transformation Pipelines: Configurable mapping and processing rules

### Restaurant Industry Integrations
- **Toast POS**: Orders, menu items, payments, inventory, labor
- **OpenTable**: Reservations, guests, reviews, table management
- **7Shifts**: Employee scheduling, time tracking, labor optimization

## Architecture

```
├── app/                    # Next.js app directory
│   ├── actions/           # Server actions for data operations
│   ├── api/               # API routes
│   └── (routes)/          # Application pages
├── components/            # React components
│   ├── dashboard/         # Dashboard UI components
│   ├── analytics/         # Analytics visualizations
│   └── ui/                # Shared UI components
├── lib/                   # Core business logic
│   ├── ai/                # AI service integrations
│   ├── analytics/         # Knowledge graph and analytics
│   ├── db/                # Database connections
│   ├── integrations/      # Restaurant platform integrations
│   ├── schemas/           # Schema transformation engine
│   ├── types/             # TypeScript type definitions
│   ├── utils/             # Utility functions
│   └── workflows/         # Workflow generator with TRIZ
└── services/              # External service integrations
```

## Getting Started

### Prerequisites
- Node.js 18+
- pnpm 8+
- Neo4j 5+
- Supabase account
- Snowflake account (optional)
- API keys for Toast, OpenTable, and/or 7Shifts

### Installation

1. Clone the repository:
```bash
git clone https://github.com/your-org/restaurant-intelligence-platform.git
cd restaurant-intelligence-platform
```

2. Install dependencies:
```bash
pnpm install
```

3. Set up environment variables:
```bash
cp .env.example .env.local
```

4. Configure your environment variables in `.env.local`:
```env
# Database Connections
NEO4J_URI=bolt://localhost:7687
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=your-password

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# AI Configuration
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...

# Restaurant APIs
TOAST_API_KEY=your-toast-key
OPENTABLE_CLIENT_ID=your-opentable-id
SEVENSHIFTS_API_KEY=your-7shifts-key
```

5. Run the development server:
```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) to see the application.

## Usage

### Dashboard
The main dashboard provides:
- Real-time metrics and KPIs
- AI-powered insights and recommendations
- Active alerts with intelligent analysis
- Natural language query interface
- Quick actions for data sync and workflow execution

### Schema Transformation
Transform schemas between different formats:
```typescript
import { transformSchema } from '@/app/actions';

const result = await transformSchema(
  'graphql',
  'typescript',
  graphqlSchema,
  { preserveComments: true }
);
```

### Workflow Generation
Generate AI-powered workflows with TRIZ principles:
```typescript
import { generateWorkflow } from '@/app/actions';

const workflow = await generateWorkflow({
  goal: 'Optimize kitchen operations during peak hours',
  dataSources: ['toast', 'opentable', '7shifts'],
  preferences: {
    trizPrinciples: [1, 5, 15], // Segmentation, Merging, Dynamics
    optimizeFor: 'speed'
  }
});
```

### Knowledge Graph Analytics
Perform advanced graph analytics:
```typescript
import { detectCommunities, findInfluencers } from '@/app/actions';

// Detect customer communities
const communities = await detectCommunities('Customer', 'VISITS', 'louvain');

// Find influential menu items
const influencers = await findInfluencers('menuItemId123', 2, ['ORDERED_WITH']);
```

## API Integration Examples

### Toast POS
```typescript
const toastIntegration = new ToastIntegration(config);
const orders = await toastIntegration.getOrders({
  startDate: new Date('2024-01-01'),
  endDate: new Date()
});
```

### OpenTable
```typescript
const openTableIntegration = new OpenTableIntegration(config);
const reservations = await openTableIntegration.getReservations({
  status: ['Booked', 'Seated']
});
```

### 7Shifts
```typescript
const sevenShiftsIntegration = new SevenShiftsIntegration(config);
const shifts = await sevenShiftsIntegration.getShifts({
  startDate: new Date(),
  endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
});
```

## Development

### Code Structure
- **Server Actions**: All data mutations go through server actions in `app/actions/`
- **Type Safety**: Comprehensive TypeScript types in `lib/types/`
- **Composable Architecture**: Modular components and services
- **Real-time Updates**: Leveraging Next.js 15+ features for real-time data

### Testing
```bash
pnpm test        # Run unit tests
pnpm test:e2e    # Run end-to-end tests
pnpm lint        # Run linting
pnpm typecheck   # Run type checking
```

### Building for Production
```bash
pnpm build       # Build the application
pnpm start       # Start production server
```

## Deployment

The application is optimized for deployment on:
- Vercel (recommended)
- AWS with Docker
- Google Cloud Run
- Any Node.js hosting platform

### Environment Variables
Ensure all required environment variables are set in your deployment platform.

### Database Setup
1. Set up Neo4j instance (cloud or self-hosted)
2. Configure Supabase project
3. (Optional) Set up Snowflake warehouse

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

For support, email support@restaurant-intelligence.com or join our Slack community.