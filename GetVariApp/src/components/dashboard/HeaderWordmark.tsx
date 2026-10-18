import React from 'react';
import { Image, View } from 'react-native';

import { useThemeMode } from '../../theme/theme';

/** The wordmark in white, for the dark background. */
const PLAIN = require('../../../icon/plain logo.png');
/** The same wordmark in navy, for the light background. */
const BLUE = require('../../../icon/blue logo.png');

/**
 * Both files are a 1536×1024 canvas with the wordmark in the middle of it and
 * transparent space all round. This is the part of the canvas the wordmark
 * (and the soft edge around it) occupies, in the files' own pixels — the same
 * window for both, so the two sit in exactly the same place.
 */
const CANVAS = { width: 1536, height: 1024 };
const MARK = { x: 340, y: 352, width: 810, height: 264 };

interface HeaderWordmarkProps {
  /** Drawn height of the wordmark. The width follows from its proportions. */
  height?: number;
}

/**
 * The dashboard header's logo: the supplied wordmark image, white in dark
 * mode and navy in light mode.
 *
 * The image is scaled as a whole, so its proportions are never changed; the
 * frame around it only hides the empty canvas.
 */
const HeaderWordmark: React.FC<HeaderWordmarkProps> = ({ height = 26 }) => {
  // Subscribed, so the image is swapped the moment the mode is.
  const mode = useThemeMode();
  const scale = height / MARK.height;

  return (
    <View style={{ width: MARK.width * scale, height, overflow: 'hidden' }}>
      <Image
        source={mode === 'light' ? BLUE : PLAIN}
        resizeMode="contain"
        fadeDuration={0}
        style={{
          position: 'absolute',
          left: -MARK.x * scale,
          top: -MARK.y * scale,
          width: CANVAS.width * scale,
          height: CANVAS.height * scale,
        }}
      />
    </View>
  );
};

export default HeaderWordmark;
