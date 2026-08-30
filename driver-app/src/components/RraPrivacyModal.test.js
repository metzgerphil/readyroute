import React from 'react';
import renderer, { act } from 'react-test-renderer';

import RraPrivacyModal from './RraPrivacyModal';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 20, left: 0 })
}));

describe('RraPrivacyModal', () => {
  it('lets a driver acknowledge the company authorization without making an individual choice', () => {
    const onAcknowledge = jest.fn();
    let tree;

    act(() => {
      tree = renderer.create(
        <RraPrivacyModal companyAuthorized onAcknowledge={onAcknowledge} required visible />
      );
    });

    act(() => {
      tree.root.findByProps({ testID: 'acknowledge-company-ai-button' }).props.onPress();
    });

    expect(onAcknowledge).toHaveBeenCalledWith('2026-08-20');
    expect(tree.root.findAllByProps({ testID: 'continue-without-ai-processing-button' })).toHaveLength(0);
  });

  it('disables acknowledgement while it is being saved', () => {
    let tree;

    act(() => {
      tree = renderer.create(
        <RraPrivacyModal companyAuthorized isSaving onAcknowledge={jest.fn()} required visible />
      );
    });

    expect(tree.root.findByProps({ testID: 'acknowledge-company-ai-button' }).props.disabled).toBe(true);
  });

  it('shows company-controlled off status without an authorization action', () => {
    let tree;

    act(() => {
      tree = renderer.create(
        <RraPrivacyModal onAcknowledge={jest.fn()} onClose={jest.fn()} visible />
      );
    });

    expect(tree.root.findAllByProps({ testID: 'acknowledge-company-ai-button' })).toHaveLength(0);
    expect(tree.root.findAllByType(require('react-native').Text).map((node) => node.props.children).join(' ')).toContain('currently off for this company');
  });
});
