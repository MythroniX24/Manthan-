

import React, { useRef, useEffect } from 'react';

interface VisualizerProps {
  analyser: AnalyserNode | null;
  isListening: boolean;
}

const BAR_COUNT = 64;

export const Visualizer: React.FC<VisualizerProps> = ({ analyser, isListening }) => {
  const visualizerRef = useRef<SVGSVGElement>(null);
  const animationFrameId = useRef<number>(0);
  const barsRef = useRef<SVGRectElement[]>([]);

  useEffect(() => {
    barsRef.current = barsRef.current.slice(0, BAR_COUNT);
  }, []);

  useEffect(() => {
    if (!analyser) return;

    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    const animate = () => {
      analyser.getByteFrequencyData(dataArray);
      
      barsRef.current.forEach((bar, i) => {
        if (!bar) return;
        const index = Math.floor((i * analyser.frequencyBinCount) / BAR_COUNT);
        const barHeight = (dataArray[index] / 255) * 100;
        bar.style.transform = `scaleY(${Math.max(0.01, barHeight / 100)})`;
      });
      
      animationFrameId.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      cancelAnimationFrame(animationFrameId.current);
      barsRef.current.forEach(bar => {
        if(bar) bar.style.transform = `scaleY(0.01)`;
      });
    };
  }, [analyser]);

  return (
    <div className="relative w-full h-full flex items-center justify-center p-4">
      <svg
        ref={visualizerRef}
        className="w-full h-full"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
      >
        {Array.from({ length: BAR_COUNT }).map((_, i) => (
          <rect
            key={i}
            ref={el => { if (el) { barsRef.current[i] = el; } }}
            x={(100 / BAR_COUNT) * i}
            y="0"
            width={100 / BAR_COUNT - 0.5}
            height="100"
            className={`fill-current transition-transform duration-75 ease-out ${isListening ? 'text-cyan-400' : 'text-gray-600'}`}
            style={{ transform: 'scaleY(0.01)', transformOrigin: 'bottom' }}
          />
        ))}
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <div className={`w-32 h-32 rounded-full transition-all duration-300 ${isListening ? 'bg-cyan-500/20 animate-pulse' : 'bg-gray-700/50'}`}></div>
      </div>
    </div>
  );
};