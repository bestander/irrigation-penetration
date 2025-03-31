import React, { useState, useRef, useEffect, useMemo } from 'react';
import './App.css';

interface Point {
  x: number;
  y: number;
}

interface Shape {
  points: Point[];
  area: number;
  type: 'regular' | 'exclusion' | 'drip' | 'delete';
}

interface Ruler {
  start: Point;
  end: Point;
  length: number;
  unit: 'ft' | 'm';
}

type DrawingTool = 'regular' | 'exclusion' | 'drip' | 'ruler' | 'delete';

function App() {
  const [image, setImage] = useState<string | null>(() => {
    // Load image from localStorage on initial render
    return localStorage.getItem('irrigationImage');
  });
  const [hoveredRegionIndex, setHoveredRegionIndex] = useState<number | null>(null);
  const [hoverPosition, setHoverPosition] = useState<Point | null>(null);
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(() => {
    // Load dimensions from localStorage on initial render
    const savedDimensions = localStorage.getItem('irrigationDimensions');
    return savedDimensions ? JSON.parse(savedDimensions) : null;
  });
  const [startPoint, setStartPoint] = useState<Point | null>(null);
  const [currentPath, setCurrentPath] = useState<Point[]>([]);
  const [shapes, setShapes] = useState<Shape[]>(() => {
    // Load shapes from localStorage on initial render
    const savedShapes = localStorage.getItem('irrigationShapes');
    return savedShapes ? JSON.parse(savedShapes) : [];
  });
  const [currentShape, setCurrentShape] = useState<Point[]>([]);
  const [selectedTool, setSelectedTool] = useState<DrawingTool>('regular');
  const [ruler, setRuler] = useState<Ruler | null>(() => {
    // Load ruler from localStorage on initial render
    const savedRuler = localStorage.getItem('irrigationRuler');
    return savedRuler ? JSON.parse(savedRuler) : null;
  });
  const [pixelRatio, setPixelRatio] = useState<number | null>(() => {
    // Load pixel ratio from localStorage on initial render
    const savedRatio = localStorage.getItem('irrigationPixelRatio');
    return savedRatio ? parseFloat(savedRatio) : null;
  });
  const [showRulerPrompt, setShowRulerPrompt] = useState(false);
  const [rulerLength, setRulerLength] = useState<string>('');
  const [rulerUnit, setRulerUnit] = useState<'ft' | 'm'>('ft');
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const SNAP_THRESHOLD = 10; // pixels within which to snap to start point

  // Save shapes to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('irrigationShapes', JSON.stringify(shapes));
  }, [shapes]);

  // Save ruler to localStorage whenever it changes
  useEffect(() => {
    if (ruler) {
      localStorage.setItem('irrigationRuler', JSON.stringify(ruler));
    }
  }, [ruler]);

  // Save pixel ratio to localStorage whenever it changes
  useEffect(() => {
    if (pixelRatio) {
      localStorage.setItem('irrigationPixelRatio', pixelRatio.toString());
    }
  }, [pixelRatio]);

  // Save image and dimensions to localStorage whenever they change
  useEffect(() => {
    if (image) {
      localStorage.setItem('irrigationImage', image);
    }
    if (dimensions) {
      localStorage.setItem('irrigationDimensions', JSON.stringify(dimensions));
    }
  }, [image, dimensions]);

  const getShapeColor = (type: DrawingTool) => {
    switch (type) {
      case 'regular':
        return { fill: 'rgba(46, 204, 113, 0.2)', stroke: '#2ecc71' };
      case 'exclusion':
        return { fill: 'rgba(231, 76, 60, 0.2)', stroke: '#e74c3c' };
      case 'drip':
        return { fill: 'rgba(155, 89, 182, 0.2)', stroke: '#9b59b6' };
      case 'ruler':
        return { fill: 'transparent', stroke: '#f1c40f' };
      case 'delete':
        return { fill: 'transparent', stroke: '#e74c3c' };
    }
  };

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const imageData = e.target?.result as string;
          setImage(imageData);
          setDimensions({ width: img.width, height: img.height });
        };
        img.src = e.target?.result as string;
      };
      reader.readAsDataURL(file);
    }
  };

  const calculatePixelArea = (points: Point[]): number => {
    // Using the Shoelace formula (Surveyor's formula) to calculate area
    let area = 0;
    for (let i = 0; i < points.length; i++) {
      const j = (i + 1) % points.length;
      area += points[i].x * points[j].y;
      area -= points[j].x * points[i].y;
    }
    return Math.abs(area) / 2;
  };

  const isNearStartPoint = (point: Point, startPoint: Point): boolean => {
    const dx = point.x - startPoint.x;
    const dy = point.y - startPoint.y;
    return Math.sqrt(dx * dx + dy * dy) < SNAP_THRESHOLD;
  };

  const calculatePixelDistance = (p1: Point, p2: Point): number => {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const calculateUninterruptedRegularArea = (): Point[][] => {
    const regularShapes = shapes.filter(shape => shape.type === 'regular');
    const exclusionShapes = shapes.filter(shape => shape.type === 'exclusion');
    const gridSize = 10;
    const visited: Set<string> = new Set();
    const regions: Point[][] = [];
  
    if (!dimensions) return [];
  
    // Helper to get grid key
    const getKey = (x: number, y: number) => `${x},${y}`;
  
    // Check if a point is in an uninterrupted area
    const isUninterrupted = (point: Point): boolean => {
      let isInRegular = false;
      let isExcluded = false;
  
      for (const shape of regularShapes) {
        if (isPointInShape(point, shape.points)) {
          isInRegular = true;
          break;
        }
      }
  
      for (const shape of exclusionShapes) {
        if (isPointInShape(point, shape.points)) {
          isExcluded = true;
          break;
        }
      }
  
      return isInRegular && !isExcluded;
    };
  
    // Flood fill to find connected region
    const floodFill = (startX: number, startY: number): Point[] => {
      const region: Point[] = [];
      const queue: Point[] = [{ x: startX, y: startY }];
      const directions = [
        { dx: 0, dy: -gridSize }, // up
        { dx: 0, dy: gridSize },  // down
        { dx: -gridSize, dy: 0 }, // left
        { dx: gridSize, dy: 0 },  // right
      ];
  
      while (queue.length > 0) {
        const { x, y } = queue.shift()!;
        const key = getKey(x, y);
  
        if (
          visited.has(key) ||
          x < 0 || x >= dimensions.width ||
          y < 0 || y >= dimensions.height ||
          !isUninterrupted({ x, y })
        ) {
          continue;
        }
  
        visited.add(key);
        region.push({ x, y });
  
        for (const { dx, dy } of directions) {
          queue.push({ x: x + dx, y: y + dy });
        }
      }
  
      return region;
    };
  
    // Scan the grid for unvisited uninterrupted points
    for (let x = 0; x < dimensions.width; x += gridSize) {
      for (let y = 0; y < dimensions.height; y += gridSize) {
        const key = getKey(x, y);
        if (!visited.has(key) && isUninterrupted({ x, y })) {
          const region = floodFill(x, y);
          if (region.length > 0) {
            regions.push(region);
          }
        }
      }
    }
  
    return regions;
  };

  const calculateTotalArea = (type: 'regular' | 'exclusion' | 'drip'): number => {
    const shapesOfType = shapes.filter(shape => shape.type === type);
    
    if (type === 'regular' || type === 'drip') {
      // For regular and drip zones, we need to handle overlapping zones differently
      // We'll take the maximum area of any zone that contains the current point
      let totalArea = 0;
      const gridSize = 10; // Size of grid cells for area calculation
      
      if (!dimensions) return 0;
      
      // Create a grid of points to sample
      for (let x = 0; x < dimensions.width; x += gridSize) {
        for (let y = 0; y < dimensions.height; y += gridSize) {
          const point = { x, y };
          let maxArea = 0;
          
          // Check each shape
          for (const shape of shapesOfType) {
            if (isPointInShape(point, shape.points)) {
              maxArea = Math.max(maxArea, shape.area);
            }
          }
          
          if (maxArea > 0) {
            totalArea += gridSize * gridSize;
          }
        }
      }

      // Calculate exclusion area using union
      const exclusionShapes = shapes.filter(shape => shape.type === 'exclusion');
      let exclusionArea = 0;
      for (let x = 0; x < dimensions.width; x += gridSize) {
        for (let y = 0; y < dimensions.height; y += gridSize) {
          const point = { x, y };
          let isExcluded = false;
          
          // Check each exclusion shape
          for (const shape of exclusionShapes) {
            if (isPointInShape(point, shape.points)) {
              isExcluded = true;
              break;
            }
          }
          
          if (isExcluded) {
            exclusionArea += gridSize * gridSize;
          }
        }
      }

      // Calculate intersection with exclusion area
      let intersectionArea = 0;
      for (let x = 0; x < dimensions.width; x += gridSize) {
        for (let y = 0; y < dimensions.height; y += gridSize) {
          const point = { x, y };
          let isInZone = false;
          let isExcluded = false;
          
          // Check if point is in any zone of the current type
          for (const shape of shapesOfType) {
            if (isPointInShape(point, shape.points)) {
              isInZone = true;
              break;
            }
          }
          
          // Check if point is in any exclusion zone
          for (const shape of exclusionShapes) {
            if (isPointInShape(point, shape.points)) {
              isExcluded = true;
              break;
            }
          }
          
          if (isInZone && isExcluded) {
            intersectionArea += gridSize * gridSize;
          }
        }
      }

      return Math.max(0, totalArea - intersectionArea);
    } else {
      // For exclusion zones, use the same grid approach to calculate union
      let totalArea = 0;
      const gridSize = 10;
      
      if (!dimensions) return 0;
      
      for (let x = 0; x < dimensions.width; x += gridSize) {
        for (let y = 0; y < dimensions.height; y += gridSize) {
          const point = { x, y };
          let isExcluded = false;
          
          // Check each exclusion shape
          for (const shape of shapesOfType) {
            if (isPointInShape(point, shape.points)) {
              isExcluded = true;
              break;
            }
          }
          
          if (isExcluded) {
            totalArea += gridSize * gridSize;
          }
        }
      }

      return totalArea;
    }
  };

  const isPointInShape = (point: Point, shape: Point[]): boolean => {
    let inside = false;
    for (let i = 0, j = shape.length - 1; i < shape.length; j = i++) {
      const xi = shape[i].x, yi = shape[i].y;
      const xj = shape[j].x, yj = shape[j].y;
      
      if (((yi > point.y) !== (yj > point.y)) &&
          (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi)) {
        inside = !inside;
      }
    }
    return inside;
  };

  const uninterruptedRegions = useMemo(() => calculateUninterruptedRegularArea(), [shapes, dimensions]);


  const formatArea = (pixelArea: number): string => {
    if (!pixelRatio) return 'Set ruler first';
    const realArea = pixelArea * (pixelRatio * pixelRatio);
    return `${realArea.toFixed(2)} ${ruler?.unit || 'ft'}²`;
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !dimensions) return;
  
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
  
    ctx.clearRect(0, 0, dimensions.width, dimensions.height);
  
    // Draw ruler if exists
    if (ruler) {
      const color = getShapeColor('ruler');
      ctx.strokeStyle = color.stroke;
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(ruler.start.x, ruler.start.y);
      ctx.lineTo(ruler.end.x, ruler.end.y);
      ctx.stroke();
      ctx.fillStyle = color.stroke;
      ctx.font = '16px Arial';
      ctx.fillText(`${ruler.length} ${ruler.unit}`, (ruler.start.x + ruler.end.x) / 2, (ruler.start.y + ruler.end.y) / 2);
    }
  
    // Draw all completed shapes
    shapes.forEach(shape => {
      if (shape.points.length > 2) {
        const color = getShapeColor(shape.type);
        ctx.fillStyle = color.fill;
        ctx.beginPath();
        ctx.moveTo(shape.points[0].x, shape.points[0].y);
        shape.points.forEach(point => ctx.lineTo(point.x, point.y));
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = color.stroke;
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();
      }
    });
  
    // Draw uninterrupted regular areas and highlight hovered region
    const gridSize = 10;
    uninterruptedRegions.forEach((region, index) => {
      const isHovered = index === hoveredRegionIndex;
      ctx.fillStyle = isHovered ? 'rgba(46, 204, 113, 0.6)' : 'rgba(46, 204, 113, 0.2)';
      region.forEach(point => {
        ctx.fillRect(point.x, point.y, gridSize, gridSize);
      });
  
      if (isHovered && hoverPosition) {
        const area = calculateRegionArea(region);
        const formattedArea = formatArea(area);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        const textWidth = ctx.measureText(formattedArea).width + 10;
        const tooltipX = hoverPosition.x + 10;
        const tooltipY = hoverPosition.y - 30;
  
        // Ensure tooltip stays within canvas bounds
        const adjustedX = Math.min(tooltipX, dimensions.width - textWidth);
        const adjustedY = Math.max(tooltipY, 20);
  
        ctx.fillRect(adjustedX, adjustedY, textWidth, 20);
        ctx.fillStyle = 'white';
        ctx.font = '12px Arial';
        ctx.fillText(formattedArea, adjustedX + 5, adjustedY + 15);
        console.log(`Drawing tooltip for region ${index}: ${formattedArea} at (${adjustedX}, ${adjustedY})`);
      }
    });
  
    // Draw current shape and path (existing code)
    if (currentShape.length > 0) {
      const color = getShapeColor(selectedTool);
      ctx.strokeStyle = color.stroke;
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(currentShape[0].x, currentShape[0].y);
      currentShape.forEach(point => ctx.lineTo(point.x, point.y));
      if (currentPath.length > 0) {
        ctx.lineTo(currentPath[currentPath.length - 1].x, currentPath[currentPath.length - 1].y);
      }
      ctx.stroke();
    }
  
    if (currentPath.length > 1) {
      const color = getShapeColor(selectedTool);
      ctx.strokeStyle = color.stroke;
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(currentPath[0].x, currentPath[0].y);
      currentPath.forEach(point => ctx.lineTo(point.x, point.y));
      ctx.stroke();
    }
  }, [dimensions, shapes, currentShape, currentPath, selectedTool, ruler, hoveredRegionIndex, hoverPosition, uninterruptedRegions]);

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setStartPoint({ x, y });
  };

  const calculateRegionArea = (region: Point[]): number => {
    const gridSize = 10;
    return region.length * (gridSize * gridSize); // Area is number of grid cells times cell area
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !dimensions) return;
  
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const currentPoint = { x, y };
  
    if (startPoint) {
      // Existing drawing logic
      if (currentShape.length > 2 && isNearStartPoint(currentPoint, currentShape[0])) {
        setCurrentPath([startPoint, currentShape[0]]);
      } else {
        setCurrentPath([startPoint, currentPoint]);
      }
    } else {
      // Hover logic
      const gridSize = 10;
      const gridX = Math.floor(x / gridSize) * gridSize;
      const gridY = Math.floor(y / gridSize) * gridSize;
  
      const regionIndex = uninterruptedRegions.findIndex(region =>
        region.some(p => p.x === gridX && p.y === gridY)
      );
  
      if (regionIndex !== hoveredRegionIndex) {
        setHoveredRegionIndex(regionIndex !== -1 ? regionIndex : null);
        setHoverPosition(regionIndex !== -1 ? currentPoint : null);
      }
    }
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!startPoint) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const currentPoint = { x, y };

    if (selectedTool === 'ruler') {
      setRuler({ start: startPoint, end: currentPoint, length: 0, unit: 'ft' });
      setShowRulerPrompt(true);
    } else {
      // If this is the first line
      if (currentShape.length === 0) {
        setCurrentShape([startPoint, currentPoint]);
      } else {
        // Check if we're near the start point
        if (isNearStartPoint(currentPoint, currentShape[0])) {
          // Close the shape
          const closedShape = [...currentShape, currentShape[0]];
          const area = calculatePixelArea(closedShape);
          setShapes(prev => [...prev, { points: closedShape, area, type: selectedTool }]);
          setCurrentShape([]);
        } else {
          // Add line to current shape
          setCurrentShape(prev => [...prev, currentPoint]);
        }
      }
    }

    setStartPoint(null);
    setCurrentPath([]);
  };

  const handleMouseLeave = () => {
    setStartPoint(null);
    setCurrentPath([]);
    setHoveredRegionIndex(null);
    setHoverPosition(null);
  };

  const handleRulerSubmit = () => {
    if (!ruler || !rulerLength) return;
    
    const length = parseFloat(rulerLength);
    if (isNaN(length)) return;

    const pixelDistance = calculatePixelDistance(ruler.start, ruler.end);
    const ratio = length / pixelDistance;
    
    setPixelRatio(ratio);
    setRuler(prev => prev ? { ...prev, length, unit: rulerUnit } : null);
    setShowRulerPrompt(false);
    setRulerLength('');
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (selectedTool !== 'delete') return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const clickPoint = { x, y };

    // Find the first shape that contains the click point
    const shapeIndex = shapes.findIndex(shape => isPointInShape(clickPoint, shape.points));
    
    if (shapeIndex !== -1) {
      // Remove the shape at the found index
      setShapes(prev => prev.filter((_, index) => index !== shapeIndex));
    }
  };

  const handleClearAll = () => {
    // Clear all localStorage items
    localStorage.removeItem('irrigationShapes');
    localStorage.removeItem('irrigationRuler');
    localStorage.removeItem('irrigationPixelRatio');
    localStorage.removeItem('irrigationImage');
    localStorage.removeItem('irrigationDimensions');
    // Reload the page
    window.location.reload();
  };

  return (
    <div className="app-container">
      <div className="header">
        <h1>Irrigation System Planner</h1>
        <a 
          href="https://github.com/bestander/irrigation-penetration" 
          target="_blank" 
          rel="noopener noreferrer"
          className="github-link"
        >
          <svg height="24" width="24" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"></path>
          </svg>
          View Source
        </a>
      </div>
      
      <div className="upload-section">
        <input
          type="file"
          accept="image/*"
          onChange={handleImageUpload}
          className="file-input"
        />
        {shapes.length > 0 && (
          <button onClick={handleClearAll} className="clear-all-button">
            Clear All
          </button>
        )}
      </div>

      <div className="workspace">
        {image ? (
          <div className="image-container">
            <img src={image} alt="Backyard plan" className="backyard-plan" />
            {dimensions && (
              <canvas
                ref={canvasRef}
                width={dimensions.width}
                height={dimensions.height}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseLeave}
                onClick={handleCanvasClick}
                className="drawing-layer"
              />
            )}
          </div>
        ) : (
          <div className="placeholder">
            Upload your backyard plan image to get started
          </div>
        )}
      </div>

      <div className="tools-panel">
        <h2>Drawing Tools</h2>
        <div className="tool-buttons">
          <button
            className={`tool-button ${selectedTool === 'regular' ? 'active' : ''}`}
            onClick={() => setSelectedTool('regular')}
          >
            Regular Zone
          </button>
          <button
            className={`tool-button ${selectedTool === 'exclusion' ? 'active' : ''}`}
            onClick={() => setSelectedTool('exclusion')}
          >
            Exclusion Zone
          </button>
          <button
            className={`tool-button ${selectedTool === 'drip' ? 'active' : ''}`}
            onClick={() => setSelectedTool('drip')}
          >
            Drip Zone
          </button>
          <button
            className={`tool-button ${selectedTool === 'ruler' ? 'active' : ''}`}
            onClick={() => setSelectedTool('ruler')}
          >
            Ruler
          </button>
          <button
            className={`tool-button ${selectedTool === 'delete' ? 'active' : ''}`}
            onClick={() => setSelectedTool('delete')}
          >
            Delete
          </button>
        </div>
      </div>

      {showRulerPrompt && (
        <div className="ruler-prompt">
          <h3>Enter Ruler Length</h3>
          <div className="ruler-inputs">
            <input
              type="number"
              value={rulerLength}
              onChange={(e) => setRulerLength(e.target.value)}
              placeholder="Length"
              className="ruler-length-input"
            />
            <select
              value={rulerUnit}
              onChange={(e) => setRulerUnit(e.target.value as 'ft' | 'm')}
              className="ruler-unit-select"
            >
              <option value="ft">feet</option>
              <option value="m">meters</option>
            </select>
            <button onClick={handleRulerSubmit} className="ruler-submit-button">
              Set Scale
            </button>
          </div>
        </div>
      )}

      {shapes.length > 0 && (
        <div className="zone-areas">
          <h3>Zone Areas</h3>
          <div className="zone-area-item regular">
            <span className="zone-label">Regular Zones:</span>
            <span className="zone-value">{formatArea(calculateTotalArea('regular'))}</span>
          </div>
          <div className="zone-area-item drip">
            <span className="zone-label">Drip Zones:</span>
            <span className="zone-value">{formatArea(calculateTotalArea('drip'))}</span>
          </div>
          <div className="zone-area-item exclusion">
            <span className="zone-label">Exclusion Zones:</span>
            <span className="zone-value">{formatArea(calculateTotalArea('exclusion'))}</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
