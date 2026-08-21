import React from 'react';
import renderer, { act } from 'react-test-renderer';

import RraPrivacyModal from './RraPrivacyModal';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 20, left: 0 })
}));

describe('RraPrivacyModal', () => {
  it('keeps the consent actions tappable outside the scrolling notice', () => {
    const onChoose = jest.fn();
    let tree;

    act(() => {
      tree = renderer.create(
        <RraPrivacyModal onChoose={onChoose} required visible />
      );
    });

    act(() => {
      tree.root.findByProps({ testID: 'allow-ai-processing-button' }).props.onPress();
    });

    expect(onChoose).toHaveBeenCalledWith(true, '2026-08-20');

    act(() => {
      tree.root.findByProps({ testID: 'continue-without-ai-processing-button' }).props.onPress();
    });

    expect(onChoose).toHaveBeenCalledWith(false, '2026-08-20');
  });

  it('disables both actions while the preference is being saved', () => {
    let tree;

    act(() => {
      tree = renderer.create(
        <RraPrivacyModal isSaving onChoose={jest.fn()} required visible />
      );
    });

    expect(tree.root.findByProps({ testID: 'allow-ai-processing-button' }).props.disabled).toBe(true);
    expect(tree.root.findByProps({ testID: 'continue-without-ai-processing-button' }).props.disabled).toBe(true);
  });
});
