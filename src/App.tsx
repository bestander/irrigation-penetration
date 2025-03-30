import React, { useState, useRef, useEffect } from 'react';
import './App.css';

interface Point {
  x: number;
  y: number;
}

interface Shape {
  points: Point[];
  area: number;
}

function App() {
  const [image, setImage] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);
  const [length, setLength] = useState<number>(0);
  const [width, setWidth] = useState<number>(0);
  const [startPoint, setStartPoint] = useState<Point | null>(null);
  const [currentPath, setCurrentPath] = useState<Point[]>([]);
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [currentShape, setCurrentShape] = useState<Point[]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const SNAP_THRESHOLD = 10; // pixels within which to snap to start point

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

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !dimensions) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, dimensions.width, dimensions.height);

    // Draw all completed shapes
    shapes.forEach(shape => {
      if (shape.points.length > 2) {
        // Fill shape
        ctx.fillStyle = 'rgba(52, 152, 219, 0.2)';
        ctx.beginPath();
        ctx.moveTo(shape.points[0].x, shape.points[0].y);
        shape.points.forEach(point => {
          ctx.lineTo(point.x, point.y);
        });
        ctx.closePath();
        ctx.fill();

        // Draw shape outline
        ctx.strokeStyle = '#3498db';
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();
      }
    });

    // Draw current shape
    if (currentShape.length > 0) {
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
      ctx.beginPath();
      ctx.moveTo(currentPath[0].x, currentPath[0].y);
      currentPath.forEach(point => {
        ctx.lineTo(point.x, point.y);
      });
      ctx.stroke();
    }
  }, [dimensions, shapes, currentShape, currentPath]);

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

    // If this is the first line
    if (currentShape.length === 0) {
      setCurrentShape([startPoint, currentPoint]);
    } else {
      // Check if we're near the start point
      if (isNearStartPoint(currentPoint, currentShape[0])) {
        // Close the shape
        const closedShape = [...currentShape, currentShape[0]];
        const area = calculatePixelArea(closedShape);
        setShapes(prev => [...prev, { points: closedShape, area }]);
        setCurrentShape([]);
      } else {
        // Add line to current shape
        setCurrentShape(prev => [...prev, currentPoint]);
      }
    }

    setStartPoint(null);
    setCurrentPath([]);
  };

  const handleMouseLeave = () => {
    setStartPoint(null);
    setCurrentPath([]);
  };

  const calculateArea = () => {
    return (length * width).toFixed(2);
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

      <div className="measurements-panel">
        <h2>Measurements</h2>
        <div className="measurements-form">
          <div className="input-group">
            <label>Length (meters):</label>
            <input
              type="number"
              step="0.1"
              value={length}
              onChange={(e) => setLength(parseFloat(e.target.value) || 0)}
            />
          </div>
          <div className="input-group">
            <label>Width (meters):</label>
            <input
              type="number"
              step="0.1"
              value={width}
              onChange={(e) => setWidth(parseFloat(e.target.value) || 0)}
            />
          </div>
          <div className="area-display">
            <h3>Area: <span>{calculateArea()}</span> m²</h3>
          </div>
          {shapes.length > 0 && (
            <div className="pixel-area-display">
              <h3>Pixel Area: <span>{shapes[shapes.length - 1].area.toFixed(0)}</span> pixels²</h3>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
