import React from 'react';

interface TableSkeletonProps {
  columns: number;
  rows: number;
}

export default function TableSkeleton({ columns, rows }: TableSkeletonProps) {
  return (
    <>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <tr key={rowIndex} className="saas-tr">
          {Array.from({ length: columns }).map((_, colIndex) => {
            
            // 🔥 DETERMINISTIC "RANDOM" WIDTH: 
            // Uses row and col indexes to create a staggered, random-looking 
            // width that is perfectly identical on both server and client.
            const widthPercent = 40 + ((rowIndex * 13 + colIndex * 7) % 45);

            return (
              <td key={colIndex} className="saas-td">
                <div 
                  className="skeleton-box" 
                  style={{ width: `${widthPercent}%` }} 
                />
              </td>
            );
          })}
        </tr>
      ))}
    </>
  );
}