import React, { useState, useRef, useEffect } from 'react';
import './App.css';

interface Point {
  x: number;
  y: number;
}

interface Shape {
  points: Point[];
  area: number;
  type: 'regular' | 'exclusion' | 'drip';
}

interface Ruler {
  start: Point;
  end: Point;
  length: number;
  unit: 'ft' | 'm';
}

type DrawingTool = 'regular' | 'exclusion' | 'drip' | 'ruler';

function App() {
  const [image, setImage] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);
  const [startPoint, setStartPoint] = useState<Point | null>(null);
  const [currentPath, setCurrentPath] = useState<Point[]>([]);
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [currentShape, setCurrentShape] = useState<Point[]>([]);
  const [selectedTool, setSelectedTool] = useState<DrawingTool>('regular');
  const [ruler, setRuler] = useState<Ruler | null>(null);
  const [pixelRatio, setPixelRatio] = useState<number | null>(null);
  const [showRulerPrompt, setShowRulerPrompt] = useState(false);
  const [rulerLength, setRulerLength] = useState<string>('');
  const [rulerUnit, setRulerUnit] = useState<'ft' | 'm'>('ft');
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const SNAP_THRESHOLD = 10; // pixels within which to snap to start point

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
    }
  };

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          setImage(e.target?.result as string);
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

  const calculateIntersectionArea = (shape1: Point[], shape2: Point[]): number => {
    // Simple intersection calculation using bounding boxes
    // This is an approximation - for more accurate results we'd need a proper polygon intersection algorithm
    const getBounds = (points: Point[]) => {
      const xs = points.map(p => p.x);
      const ys = points.map(p => p.y);
      return {
        minX: Math.min(...xs),
        maxX: Math.max(...xs),
        minY: Math.min(...ys),
        maxY: Math.max(...ys)
      };
    };

    const bounds1 = getBounds(shape1);
    const bounds2 = getBounds(shape2);

    const intersectionWidth = Math.max(0, Math.min(bounds1.maxX, bounds2.maxX) - Math.max(bounds1.minX, bounds2.minX));
    const intersectionHeight = Math.max(0, Math.min(bounds1.maxY, bounds2.maxY) - Math.max(bounds1.minY, bounds2.minY));

    return intersectionWidth * intersectionHeight;
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

    // Clear canvas
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

      // Draw ruler length text
      ctx.fillStyle = color.stroke;
      ctx.font = '16px Arial';
      ctx.fillText(`${ruler.length} ${ruler.unit}`, (ruler.start.x + ruler.end.x) / 2, (ruler.start.y + ruler.end.y) / 2);
    }

    // Draw all completed shapes
    shapes.forEach(shape => {
      if (shape.points.length > 2) {
        const color = getShapeColor(shape.type);
        // Fill shape
        ctx.fillStyle = color.fill;
        ctx.beginPath();
        ctx.moveTo(shape.points[0].x, shape.points[0].y);
        shape.points.forEach(point => {
          ctx.lineTo(point.x, point.y);
        });
        ctx.closePath();
        ctx.fill();

        // Draw shape outline
        ctx.strokeStyle = color.stroke;
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();
      }
    });

    // Draw current shape
    if (currentShape.length > 0) {
      const color = getShapeColor(selectedTool);
      ctx.strokeStyle = color.stroke;
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      
      ctx.beginPath();
      ctx.moveTo(currentShape[0].x, currentShape[0].y);
      currentShape.forEach(point => {
        ctx.lineTo(point.x, point.y);
      });
      if (currentPath.length > 0) {
        ctx.lineTo(currentPath[currentPath.length - 1].x, currentPath[currentPath.length - 1].y);
      }
      ctx.stroke();
    }

    // Draw current line
    if (currentPath.length > 1) {
      const color = getShapeColor(selectedTool);
      ctx.strokeStyle = color.stroke;
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      
      ctx.beginPath();
      ctx.moveTo(currentPath[0].x, currentPath[0].y);
      currentPath.forEach(point => {
        ctx.lineTo(point.x, point.y);
      });
      ctx.stroke();
    }
  }, [dimensions, shapes, currentShape, currentPath, selectedTool, ruler]);

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setStartPoint({ x, y });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!startPoint) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Check if we're near the start point
    const currentPoint = { x, y };
    if (currentShape.length > 2 && isNearStartPoint(currentPoint, currentShape[0])) {
      // Snap to start point
      setCurrentPath([startPoint, currentShape[0]]);
    } else {
      setCurrentPath([startPoint, currentPoint]);
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

  return (
    <div className="app-container">
      <h1>Irrigation System Planner</h1>
      
      <div className="upload-section">
        <input
          type="file"
          accept="image/*"
          onChange={handleImageUpload}
          className="file-input"
        />
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
