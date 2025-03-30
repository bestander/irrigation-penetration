# Irrigation System Planner

[![Live Demo](https://img.shields.io/badge/Live%20Demo-View%20Now-green)](https://bestander.github.io/irrigation-penetration)

![Irrigation System Planner Demo](https://raw.githubusercontent.com/bestander/irrigation-penetration/master/public/recording.gif)

A web-based tool for planning irrigation systems by drawing zones on your backyard plan. This tool helps you visualize and calculate areas for regular irrigation zones, drip zones, and exclusion areas.

## Features

- Upload your backyard plan image
- Draw different types of zones:
  - Regular irrigation zones (green)
  - Drip zones (purple)
  - Exclusion areas (red)
- Measure distances using the ruler tool
- Calculate areas in square feet or square meters
- Automatic area calculations with proper handling of overlapping zones
- Delete individual shapes or clear all
- Persistent storage of your plan
- Mobile-friendly interface

## Usage

1. Upload your backyard plan image
2. Use the ruler tool to set the scale by drawing a line and entering its real-world length
3. Draw zones using the different tools:
   - Regular Zone: For standard sprinkler areas
   - Drip Zone: For drip irrigation areas
   - Exclusion Zone: For areas that shouldn't be irrigated
4. View the calculated areas for each zone type
5. Delete shapes by selecting the delete tool and clicking on them
6. Clear all shapes using the "Clear All" button

## Development

To run the project locally:

```bash
# Install dependencies
npm install

# Start the development server
npm start
```

The app will open in your browser at [http://localhost:3000](http://localhost:3000).

## Deployment

The application is deployed to GitHub Pages at [https://bestander.github.io/irrigation-penetration](https://bestander.github.io/irrigation-penetration).

To deploy updates:

```bash
# Build and deploy to GitHub Pages
npm run deploy
```

## Technical Details

- Built with React and TypeScript
- Uses HTML5 Canvas for drawing
- Implements the Shoelace formula for area calculations
- Stores data in localStorage for persistence
- Deployed using GitHub Pages

## License

MIT License
