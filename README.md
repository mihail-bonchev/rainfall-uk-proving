# Rainfall Explorer MVP

A modern, efficient web application that visualizes real-time and historical rainfall data from UK Environment Agency stations.

## Features

- **Interactive Map**: Explore ~1000 UK rainfall monitoring stations with live data
- **Live Readings**: Real-time rainfall measurements updated every 30 seconds
- **Historical Data**: Aggregate rainfall by region and time period (daily/weekly/monthly/custom)
- **Smart Caching**: Stores historical data locally to minimize API calls
- **Offline Support**: View cached data when the API is unavailable
- **Mobile-Friendly**: Fully responsive design for all devices

## Quick Start

### Prerequisites
- Node.js 18+
- npm or pnpm

### Installation

```bash
# Clone the repository
git clone <repo-url>
cd rainfall-uk-proving

# Install dependencies
npm install

# Create environment file
cp .env.example .env

# Start development server
npm run dev
```

The app will open at `http://localhost:5173`

## Available Scripts

```bash
npm run dev         # Start development server
npm run build       # Build for production
npm run preview     # Preview production build locally
npm run test        # Run tests
npm run test:ui     # Run tests with UI
npm run test:coverage  # Generate coverage report
npm run lint        # Run ESLint
```

## Architecture

### Frontend Stack
- **React 18** with TypeScript
- **Vite** for fast builds
- **Leaflet** for interactive maps
- **React Query** for data synchronization
- **IndexedDB** for local data persistence
- **Tailwind CSS** for styling

### Data Strategy
1. **Station Metadata**: Cached indefinitely (rarely changes)
2. **Live Readings**: Polled every 30 seconds, stored in IndexedDB
3. **Historical Data**: Downloaded on-demand from public CSV archives
4. **Regional Aggregation**: Computed locally from cached data

## Project Structure

```
src/
├── components/       # React components
│   ├── Map/         # Map and station markers
│   ├── StationDetails/  # Station information panel
│   ├── HistoricalData/  # Historical data view
│   └── UI/          # Reusable UI components
├── services/        # Business logic
│   ├── api/         # API calls and archive downloads
│   ├── db/          # IndexedDB operations
│   └── aggregation/ # Data aggregation logic
├── hooks/           # Custom React hooks
├── utils/           # Utility functions
├── types/           # TypeScript type definitions
└── __tests__/       # Tests
```

## Performance Targets

- **First Load**: < 2 seconds
- **Station Click → Panel**: < 200ms
- **Historical Query**: < 500ms (from cache)
- **Map FPS**: 60 FPS smooth interactions

## Browser Support

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+
- Mobile browsers (iOS 14+, Android Chrome 90+)

## Deployment

### Frontend (Vercel/Netlify)

```bash
npm run build
# Deploy the dist/ folder
```

### Environment Variables
See `.env.example` for all available configuration options.

## Development Phases

**Phase 1 (MVP - Current)**
- Map display with live readings
- Station click-through to details
- Historical data aggregation
- CSV archive import

**Phase 2 (Optional Backend)**
- Backend cache service (Node.js + Express)
- Distributed caching layer
- Request deduplication

**Phase 3 (Advanced)**
- WebSocket for real-time updates
- Advanced analytics and trends
- Multiple export formats
- Mobile apps (React Native)

## API Integration

This app uses the UK Environment Agency Flood Monitoring API:
- **Base URL**: `https://environment.data.gov.uk/flood-monitoring`
- **Documentation**: https://environment.data.gov.uk/flood-monitoring/doc/rainfall
- **Rate Limits**: Conservative polling recommended (30s minimum)

## Testing

```bash
# Run all tests
npm run test

# Run tests in watch mode
npm run test -- --watch

# Generate coverage report
npm run test:coverage
```

## Troubleshooting

**"IndexedDB not supported"**
- Ensure you're using a modern browser with IndexedDB support
- Clear browser cache and try again

**"API not responding"**
- Check your internet connection
- Verify the API is available at https://environment.data.gov.uk/flood-monitoring
- The app will show cached data while waiting for recovery

**"Blank map"**
- Wait for stations to load (check browser console for errors)
- Try refreshing the page

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

Open Government Licence v3.0 (uses public government data)

## Attribution

Data provided by the UK Environment Agency under the Open Government Licence.

## Support

For issues or questions, please create an issue in the repository.
