"use client";

import { useEffect, useState } from "react";
import type { RecommendationProduct } from "../lib/shopConfig";
import { productPlaceholderDataUri } from "../lib/productPlaceholder";
import { resolveProductImageUrl } from "../../../lib/productImage";

export function ProductCard({
  product,
  disabled,
  loading,
  onAdd,
  onOpen
}: {
  product: RecommendationProduct;
  disabled: boolean;
  loading: boolean;
  onAdd: (barcode: string, qty: number) => void;
  onOpen?: (p: RecommendationProduct) => void;
}) {
  const [qty, setQty] = useState(1);
  const barcode = product.barcode?.trim();
  const outOfStock = product.inStock != null && product.inStock <= 0;
  const canAct = Boolean(barcode) && !disabled && !outOfStock;
  const d = product.discountPercent ?? 0;
  const onSale = d > 0;
  const list = product.listPrice ?? product.unitPrice;
  const imageSrc = resolveProductImageUrl(product.imageUrl);
  const [imgFailed, setImgFailed] = useState(false);
  useEffect(() => {
    setImgFailed(false);
  }, [imageSrc]);
  const showPlaceholder = !imageSrc || imgFailed;

  return (
    <article className={`productCard${onSale ? " productCard--sale" : ""}`}>
      {onSale ? (
        <span className="productCard__ribbon" aria-label={`${d}% off`}>
          −{d}%
        </span>
      ) : null}
      {outOfStock ? <span className="productCard__ribbon productCard__ribbon--oos">Out of stock</span> : null}
      <button
        type="button"
        className="productCard__visual"
        onClick={() => onOpen?.(product)}
        aria-label={`View ${product.name}`}
      >
        <div className="productCard__imageWrap">
          {showPlaceholder ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={productPlaceholderDataUri(product)} alt="" className="productCard__image productCard__image--ph" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageSrc}
              alt=""
              className="productCard__image"
              onError={() => setImgFailed(true)}
            />
          )}
        </div>
      </button>
      <div className="productCard__body">
        <button type="button" className="productCard__titleBtn" onClick={() => onOpen?.(product)}>
          {product.name}
        </button>
        {product.category ? <p className="productCard__cat">{product.category}</p> : null}
        {product.size || product.color ? (
          <p className="productCard__cat">
            {[product.size, product.color].filter(Boolean).join(" · ")}
          </p>
        ) : null}
        <div className="productCard__prices">
          {onSale ? (
            <>
              <span className="productCard__price productCard__price--now">₹{product.unitPrice}</span>
              <span className="productCard__price productCard__price--was">₹{list}</span>
            </>
          ) : (
            <span className="productCard__price">₹{product.unitPrice}</span>
          )}
        </div>
        <div className="productCard__row">
          <div className="qtyStepper" aria-label="Quantity">
            <button
              type="button"
              className="qtyStepper__btn"
              disabled={!canAct || qty <= 1}
              onClick={() => setQty((q) => Math.max(1, q - 1))}
            >
              −
            </button>
            <span className="qtyStepper__val">{qty}</span>
            <button
              type="button"
              className="qtyStepper__btn"
              disabled={!canAct || qty >= 99}
              onClick={() => setQty((q) => Math.min(99, q + 1))}
            >
              +
            </button>
          </div>
          <button
            type="button"
            className="productCard__add"
            disabled={!canAct || loading}
            onClick={() => barcode && onAdd(barcode, qty)}
          >
            Add
          </button>
        </div>
      </div>
    </article>
  );
}
