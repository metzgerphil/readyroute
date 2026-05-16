jest.mock('../services/api', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    patch: jest.fn(),
    post: jest.fn()
  }
}));

jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn()
}));

import {
  buildDialUrl,
  formatSecondaryAddressDetails,
  formatWarningFlag,
  getStopContactDetails,
  getPrimaryAddressLine,
  getStatusConfig,
  getStopTypeMeta,
  getTypeBadges
} from './StopDetailScreen';

describe('StopDetailScreen helpers', () => {
  it('formats status and stop type metadata correctly', () => {
    expect(getStatusConfig('pending').label).toBe('Pending');
    expect(getStatusConfig('delivered').label).toBe('Delivered');
    expect(getStopTypeMeta('pickup').label).toBe('Pickup');
    expect(getStopTypeMeta('combined').label).toBe('Delivery + Pickup');
    expect(getStopTypeMeta('delivery').label).toBe('Delivery');
  });

  it('builds primary and secondary address details for delivery intel', () => {
    expect(
      getPrimaryAddressLine({
        address: '15175 Highland Valley Road, Unit B, Escondido, CA 92025',
        address_line2: 'Unit B'
      })
    ).toBe('15175 Highland Valley Road');

    expect(
      formatSecondaryAddressDetails({
        secondary_address_type: 'suite',
        unit_label: '3B',
        suite_label: '210',
        building_label: 'Building C',
        floor_label: 'Floor 2'
      })
    ).toBe('Type SUITE · Unit 3B · Suite 210 · Building C · Floor 2');
  });

  it('formats warning flags and type badges for stop detail chips', () => {
    expect(formatWarningFlag('loading_dock')).toBe('Loading dock');
    expect(formatWarningFlag('dog')).toBe('Dog alert');

    const badges = getTypeBadges({
      is_business: true,
      stop_type: 'combined'
    });

    expect(badges.map((badge) => badge.label)).toEqual(
      expect.arrayContaining(['BUSINESS', 'Pickup', 'DELIVERY'])
    );
  });

  it('builds dial links while preserving phone extensions', () => {
    expect(buildDialUrl('(555) 111-2222 ext. 9')).toBe('tel:5551112222,9');
    expect(buildDialUrl('555.333.4444')).toBe('tel:5553334444');
    expect(buildDialUrl('   ')).toBe('');
  });

  it('derives stop contact details from manifest contact fields', () => {
    expect(
      getStopContactDetails({
        contact_name: 'Acme Receiving',
        business_name: '',
        company_name: 'Acme Warehouse',
        primary_phone: '555-111-2222',
        alternate_phone: '',
        email: 'dock@example.com',
        customer_instructions: 'Call before arrival',
        delivery_instructions: 'Use rear dock'
      })
    ).toEqual({
      contactName: 'Acme Receiving',
      businessName: 'Acme Warehouse',
      primaryPhone: '555-111-2222',
      alternatePhone: '',
      email: 'dock@example.com',
      instructions: 'Call before arrival',
      hasPhone: true,
      hasAny: true
    });

    expect(
      getStopContactDetails({
        contact_name: 'Dock Contact',
        business_name: '   ',
        company_name: 'Fallback Company',
        customer_instructions: '   ',
        delivery_instructions: 'Use rear dock'
      })
    ).toEqual({
      contactName: 'Dock Contact',
      businessName: 'Fallback Company',
      primaryPhone: '',
      alternatePhone: '',
      email: '',
      instructions: 'Use rear dock',
      hasPhone: false,
      hasAny: true
    });
  });
});
