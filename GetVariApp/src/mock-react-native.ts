export const View = 'div';
export const Text = 'span';
export const TouchableOpacity = 'button';
export const StyleSheet = {
  create: (obj: any) => obj
};
export const NativeModules = {};
export const Platform = {
  OS: 'web',
  select: (objs: any) => objs.web || objs.default
};

export default {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  NativeModules,
  Platform
};
