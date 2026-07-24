import React from 'react';

export default function TableSkeleton({ columns = 5, rows = 5 }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <tr key={rowIndex} className="saas-tr">
          {Array.from({ length: columns }).map((_, colIndex) => (
            <td key={colIndex} className="saas-td">
              <div className="skeleton-box" style={{ width: `${Math.random() * 40 + 40}%` }}></div>
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}