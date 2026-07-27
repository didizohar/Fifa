import { useState } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { useTranslation } from "../lib/i18n";
import { copyResultText, shareResultText } from "../lib/share";
import { spacing } from "../theme";
import { Button } from "./Button";

interface ShareCopyRowProps {
  text: string;
}

/** Copy always works (native + web); native share sheet only where RN's Share API is actually available. */
export function ShareCopyRow({ text }: ShareCopyRowProps) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await copyResultText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <View style={styles.row}>
      {Platform.OS !== "web" ? (
        <Button label={t("common.share")} variant="secondary" size="sm" onPress={() => shareResultText(text)} />
      ) : null}
      <Button label={copied ? t("common.copied") : t("common.copy")} variant="secondary" size="sm" onPress={handleCopy} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: spacing.sm,
  },
});
