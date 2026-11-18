import React from 'react';

export default function ProductDetail({ product }: any) {
  return (
    <div>
      <h2>{product.name}</h2>
      {/* Critical: dangerouslySetInnerHTML without sanitization */}
      <div dangerouslySetInnerHTML={{ __html: product.descriptionHtml }} />
    </div>
  );
}
