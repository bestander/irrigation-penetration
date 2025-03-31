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

const GRID_SIZE = 10;
const SNAP_THRESHOLD = 10;

const SHAPE_COLORS = {
  regular: { fill: 'rgba(46, 204, 113, 0.2)', stroke: '#2ecc71' },
  exclusion: { fill: 'rgba(231, 76, 60, 0.2)', stroke: '#e74c3c' },
  drip: { fill: 'rgba(155, 89, 182, 0.2)', stroke: '#9b59b6' },
  ruler: { fill: 'transparent', stroke: '#f1c40f' },
  delete: { fill: 'transparent', stroke: '#e74c3c' },
} as const;

function App() {
  const [image, setImage] = useState<string | null>(() => localStorage.getItem('irrigationImage'));
  const [hoveredRegionIndex, setHoveredRegionIndex] = useState<number | null>(null);
  const [hoverPosition, setHoverPosition] = useState<Point | null>(null);
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(() => {
    const savedDimensions = localStorage.getItem('irrigationDimensions');
    return savedDimensions ? JSON.parse(savedDimensions) : null;
  });
  const [startPoint, setStartPoint] = useState<Point | null>(null);
  const [currentPath, setCurrentPath] = useState<Point[]>([]);
  const [shapes, setShapes] = useState<Shape[]>(() => {
    const savedShapes = localStorage.getItem('irrigationShapes');
    return savedShapes ? JSON.parse(savedShapes) : [];
  });
  const [currentShape, setCurrentShape] = useState<Point[]>([]);
  const [selectedTool, setSelectedTool] = useState<DrawingTool>('regular');
  const [ruler, setRuler] = useState<Ruler | null>(() => {
    const savedRuler = localStorage.getItem('irrigationRuler');
    return savedRuler ? JSON.parse(savedRuler) : null;
  });
  const [pixelRatio, setPixelRatio] = useState<number | null>(() => {
    const savedRatio = localStorage.getItem('irrigationPixelRatio');
    return savedRatio ? parseFloat(savedRatio) : null;
  });
  const [showRulerPrompt, setShowRulerPrompt] = useState(false);
  const [rulerLength, setRulerLength] = useState<string>('');
  const [rulerUnit, setRulerUnit] = useState<'ft' | 'm'>('ft');
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    localStorage.setItem('irrigationShapes', JSON.stringify(shapes));
  }, [shapes]);

  useEffect(() => {
    if (ruler) {
      localStorage.setItem('irrigationRuler', JSON.stringify(ruler));
    }
  }, [ruler]);

  useEffect(() => {
    if (pixelRatio) {
      localStorage.setItem('irrigationPixelRatio', pixelRatio.toString());
    }
  }, [pixelRatio]);

  useEffect(() => {
    if (image) {
      localStorage.setItem('irrigationImage', image);
    }
    if (dimensions) {
      localStorage.setItem('irrigationDimensions', JSON.stringify(dimensions));
    }
  }, [image, dimensions]);

  const getShapeColor = (type: DrawingTool) => SHAPE_COLORS[type];

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

  const getGridPoints = (width: number, height: number): Point[] => {
    const points: Point[] = [];
    for (let x = 0; x < width; x += GRID_SIZE) {
      for (let y = 0; y < height; y += GRID_SIZE) {
        points.push({ x, y });
      }
    }
    return points;
  };

  const calculateUninterruptedRegularArea = (): Point[][] => {
    const regularShapes = shapes.filter(shape => shape.type === 'regular');
    const exclusionShapes = shapes.filter(shape => shape.type === 'exclusion');
    const dripShapes = shapes.filter(shape => shape.type === 'drip');
    const visited: Set<string> = new Set();
    const regions: Point[][] = [];
  
    if (!dimensions) return [];
  
    const getKey = (x: number, y: number) => `${x},${y}`;
  
    const isUninterrupted = (point: Point): boolean => {
      const isInRegular = regularShapes.some(shape => isPointInShape(point, shape.points));
      const isExcluded = exclusionShapes.some(shape => isPointInShape(point, shape.points));
      const isInDrip = dripShapes.some(shape => isPointInShape(point, shape.points));
      return isInRegular && !isExcluded && !isInDrip;
    };
  
    const floodFill = (startX: number, startY: number): Point[] => {
      const region: Point[] = [];
      const queue: Point[] = [{ x: startX, y: startY }];
      const directions = [
        { dx: 0, dy: -GRID_SIZE },
        { dx: 0, dy: GRID_SIZE },
        { dx: -GRID_SIZE, dy: 0 },
        { dx: GRID_SIZE, dy: 0 },
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
  
    for (let x = 0; x < dimensions.width; x += GRID_SIZE) {
      for (let y = 0; y < dimensions.height; y += GRID_SIZE) {
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
    const exclusionShapes = shapes.filter(shape => shape.type === 'exclusion');
    
    if (!dimensions) return 0;

    const gridPoints = getGridPoints(dimensions.width, dimensions.height);
    
    if (type === 'regular' || type === 'drip') {
      let totalArea = 0;
      let exclusionArea = 0;
      let intersectionArea = 0;

      gridPoints.forEach(point => {
        const isInZone = shapesOfType.some(shape => isPointInShape(point, shape.points));
        const isExcluded = exclusionShapes.some(shape => isPointInShape(point, shape.points));

        if (isInZone) {
          totalArea += GRID_SIZE * GRID_SIZE;
        }
        if (isExcluded) {
          exclusionArea += GRID_SIZE * GRID_SIZE;
        }
        if (isInZone && isExcluded) {
          intersectionArea += GRID_SIZE * GRID_SIZE;
        }
      });

      return Math.max(0, totalArea - intersectionArea);
    } else {
      return gridPoints.reduce((area, point) => {
        if (shapesOfType.some(shape => isPointInShape(point, shape.points))) {
          return area + GRID_SIZE * GRID_SIZE;
        }
        return area;
      }, 0);
    }
  };

  const uninterruptedRegions = useMemo(() => calculateUninterruptedRegularArea(), [shapes, dimensions]);

  const formatArea = (pixelArea: number): string => {
    if (!pixelRatio) return 'Set ruler first';
    const realArea = pixelArea * (pixelRatio * pixelRatio);
    return `${realArea.toFixed(2)} ${ruler?.unit || 'ft'}²`;
  };

  const drawShape = (ctx: CanvasRenderingContext2D, shape: Shape) => {
    if (shape.points.length <= 2) return;

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
  };

  const drawPath = (ctx: CanvasRenderingContext2D, points: Point[], color: typeof SHAPE_COLORS[keyof typeof SHAPE_COLORS]) => {
    if (points.length <= 1) return;

    ctx.strokeStyle = color.stroke;
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    points.forEach(point => ctx.lineTo(point.x, point.y));
    ctx.stroke();
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !dimensions) return;
  
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
  
    ctx.clearRect(0, 0, dimensions.width, dimensions.height);
  
    if (ruler) {
      const color = getShapeColor('ruler');
      drawPath(ctx, [ruler.start, ruler.end], color);
      ctx.fillStyle = color.stroke;
      ctx.font = '16px Arial';
      ctx.fillText(`${ruler.length} ${ruler.unit}`, (ruler.start.x + ruler.end.x) / 2, (ruler.start.y + ruler.end.y) / 2);
    }
  
    shapes.forEach(shape => drawShape(ctx, shape));
  
    uninterruptedRegions.forEach((region, index) => {
      const isHovered = index === hoveredRegionIndex;
      ctx.fillStyle = isHovered ? 'rgba(46, 204, 113, 0.6)' : 'rgba(46, 204, 113, 0.2)';
      region.forEach(point => {
        ctx.fillRect(point.x, point.y, GRID_SIZE, GRID_SIZE);
      });
  
      if (isHovered && hoverPosition) {
        const area = calculateRegionArea(region);
        const formattedArea = formatArea(area);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        const textWidth = ctx.measureText(formattedArea).width + 10;
        const tooltipX = hoverPosition.x + 10;
        const tooltipY = hoverPosition.y - 30;
  
        const adjustedX = Math.min(tooltipX, dimensions.width - textWidth);
        const adjustedY = Math.max(tooltipY, 20);
  
        ctx.fillRect(adjustedX, adjustedY, textWidth, 20);
        ctx.fillStyle = 'white';
        ctx.font = '12px Arial';
        ctx.fillText(formattedArea, adjustedX + 5, adjustedY + 15);
      }
    });
  
    if (currentShape.length > 0) {
      const color = getShapeColor(selectedTool);
      const points = [...currentShape];
      if (currentPath.length > 0) {
        points.push(currentPath[currentPath.length - 1]);
      }
      drawPath(ctx, points, color);
    }
  
    if (currentPath.length > 1) {
      drawPath(ctx, currentPath, getShapeColor(selectedTool));
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
      if (currentShape.length > 2 && isNearStartPoint(currentPoint, currentShape[0])) {
        setCurrentPath([startPoint, currentShape[0]]);
      } else {
        setCurrentPath([startPoint, currentPoint]);
      }
    } else {
      const gridX = Math.floor(x / GRID_SIZE) * GRID_SIZE;
      const gridY = Math.floor(y / GRID_SIZE) * GRID_SIZE;
  
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
    } else if (selectedTool === 'delete') {
      const clickPoint = { x, y };
      const shapeIndex = shapes.findIndex(shape => isPointInShape(clickPoint, shape.points));
      
      if (shapeIndex !== -1) {
        setShapes(prev => prev.filter((_, index) => index !== shapeIndex));
      }
    } else {
      if (currentShape.length === 0) {
        setCurrentShape([startPoint, currentPoint]);
      } else {
        if (isNearStartPoint(currentPoint, currentShape[0])) {
          const closedShape = [...currentShape, currentShape[0]];
          const area = calculatePixelArea(closedShape);
          setShapes(prev => [...prev, { points: closedShape, area, type: selectedTool }]);
          setCurrentShape([]);
        } else {
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

    const shapeIndex = shapes.findIndex(shape => isPointInShape(clickPoint, shape.points));
    
    if (shapeIndex !== -1) {
      setShapes(prev => prev.filter((_, index) => index !== shapeIndex));
    }
  };

  const handleClearAll = () => {
    localStorage.removeItem('irrigationShapes');
    localStorage.removeItem('irrigationRuler');
    localStorage.removeItem('irrigationPixelRatio');
    localStorage.removeItem('irrigationImage');
    localStorage.removeItem('irrigationDimensions');
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
