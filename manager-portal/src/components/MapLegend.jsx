import { useState } from 'react';

function iconBaseStyle() {
  return {
    position: 'relative',
    width: 24,
    height: 24,
    borderRadius: '50%',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flex: '0 0 24px',
    fontSize: 10,
    fontWeight: 900,
    boxSizing: 'border-box'
  };
}

function renderLegendIcon(type) {
  const base = iconBaseStyle();

  if (type === 'pending') {
    return <span style={{ ...base, background: '#ffffff', border: '2px solid #111111', color: '#111111' }}>1</span>;
  }

  if (type === 'delivered') {
    return <span style={{ ...base, background: '#27ae60', color: '#ffffff' }} />;
  }

  if (type === 'attempted') {
    return <span style={{ ...base, background: '#f39c12', color: '#ffffff' }} />;
  }

  if (type === 'incomplete') {
    return <span style={{ ...base, background: '#e74c3c', color: '#ffffff' }} />;
  }

  if (type === 'business') {
    return (
      <span style={{ ...base, background: '#ffffff', border: '2px solid #4d148c', color: '#111111' }}>
        <span
          style={{
            position: 'absolute',
            right: -2,
            bottom: -2,
            width: 14,
            height: 14,
            borderRadius: '50%',
            background: '#4d148c',
            color: '#ffffff',
            fontSize: 8,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          B
        </span>
      </span>
    );
  }

  if (type === 'apartment') {
    return (
      <span style={{ ...base, background: '#ffffff', border: '2px solid #ff6200', color: '#111111' }}>
        1
        <span
          style={{
            position: 'absolute',
            left: -2,
            top: -2,
            width: 14,
            height: 14,
            borderRadius: '50%',
            background: '#ff6200',
            color: '#ffffff',
            fontSize: 8,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '1px solid #ffffff'
          }}
        >
          A
        </span>
      </span>
    );
  }

  if (type === 'pickup') {
    return <span style={{ ...base, background: '#2980b9', border: '2px solid #1f6d9b', color: '#ffffff', fontSize: 14 }}>+</span>;
  }

  if (type === 'time-commit') {
    return (
      <span style={{ ...base, background: '#2980b9', border: '2px solid #1f6d9b', color: '#ffffff', fontSize: 14 }}>+</span>
    );
  }

  if (type === 'note') {
    return (
      <span style={{ ...base, background: '#ffffff', border: '2px solid #111111', color: '#111111' }}>
        <span
          style={{
            position: 'absolute',
            left: -2,
            bottom: -2,
            width: 14,
            height: 14,
            borderRadius: '50%',
            background: '#111111',
            color: '#ffffff',
            fontSize: 8,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          ✏
        </span>
      </span>
    );
  }

  if (type === 'combined') {
    return (
      <span style={{ ...base, background: '#ffffff', border: '2px solid #111111', color: '#111111' }}>
        1
        <span
          style={{
            position: 'absolute',
            right: -2,
            top: -2,
            width: 14,
            height: 14,
            borderRadius: '50%',
            background: '#2980b9',
            color: '#ffffff',
            fontSize: 9,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          +
        </span>
      </span>
    );
  }

  return <span style={{ ...base, background: '#888888', color: '#ffffff' }}>RR</span>;
}

const items = [
  { id: 'pending', label: 'Pending delivery', detail: 'Default manifest stop waiting to be worked.' },
  { id: 'delivered', label: 'Delivered', detail: 'Completed delivery stop.' },
  { id: 'attempted', label: 'Attempted', detail: 'Delivery attempt made but not completed.' },
  { id: 'incomplete', label: 'Incomplete', detail: 'Stop closed out with an incomplete status.' },
  { id: 'business', label: 'Business stop', detail: 'Commercial consignee or office delivery with the FedEx-purple business frame and B badge.' },
  { id: 'apartment', label: 'Apartment / unit stop', detail: 'Residential unit stop with the orange frame and apartment A badge.' },
  { id: 'pickup', label: 'Pickup stop', detail: 'Pickup-only stop.' },
  { id: 'time-commit', label: 'Timed pickup / drop off', detail: 'Blue plus marker. Stop has a ready and close window that must be reviewed before arrival.' },
  { id: 'note', label: 'Has delivery note', detail: 'Saved address or stop note exists.' },
  { id: 'combined', label: 'Combined delivery + pickup', detail: 'Both delivery and pickup at the same stop.' },
  { id: 'driver', label: 'Driver live position', detail: 'Most recent active driver ping.' }
];

export default function MapLegend({ hidden = false }) {
  const [expanded, setExpanded] = useState(true);

  if (hidden) {
    return null;
  }

  return (
    <div
      style={{
        position: 'absolute',
        left: 18,
        bottom: 18,
        zIndex: 4,
        width: 260,
        border: '1px solid rgba(232, 221, 210, 0.96)',
        borderRadius: 20,
        background: 'rgba(255, 255, 255, 0.98)',
        boxShadow: '0 10px 24px rgba(23, 48, 66, 0.12)',
        overflow: 'hidden'
      }}
    >
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        style={{
          width: '100%',
          minHeight: 40,
          padding: '10px 12px',
          border: 0,
          background: '#ffffff',
          color: '#173042',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '0.85rem',
          fontWeight: 900,
          cursor: 'pointer'
        }}
      >
        <span>Legend</span>
        <span style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 160ms ease' }}>▾</span>
      </button>

        <div
          style={{
          maxHeight: expanded ? 420 : 0,
          overflow: 'hidden',
          transition: 'max-height 220ms ease'
        }}
      >
        <div style={{ padding: '0 12px 12px', display: 'grid', gap: 8 }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '34px minmax(0, 1fr)',
              gap: 10,
              color: '#6a7680',
              fontSize: '0.7rem',
              fontWeight: 900,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              padding: '2px 0 4px'
            }}
          >
            <span>Map</span>
            <span>Stop Type</span>
          </div>
          {items.map((item) => (
            <div
              key={item.id}
              style={{
                display: 'grid',
                gridTemplateColumns: '34px minmax(0, 1fr)',
                gap: 8,
                color: '#173042',
                alignItems: 'start',
                padding: '4px 0'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 2 }}>{renderLegendIcon(item.id)}</div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '0.82rem', fontWeight: 800 }}>{item.label}</div>
                <div style={{ color: '#6a7680', fontSize: '0.76rem', lineHeight: 1.45, marginTop: 2 }}>{item.detail}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
