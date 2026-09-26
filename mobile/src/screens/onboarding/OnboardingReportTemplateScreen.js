import React, { useEffect, useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView, Switch, ActivityIndicator } from "react-native";
import { api } from "../../api/client";
import { stepLabel, nextRoute } from "../../onboarding/steps";
import { onboardingStyles as s } from "./onboardingStyles";

const ROUTE = "OnboardingReportTemplate";

function Chip({ label, selected, onPress }) {
  return (
    <Pressable style={[s.chip, selected && s.chipSelected]} onPress={onPress}>
      <Text style={[s.chipText, selected && s.chipTextSelected]}>{label}</Text>
    </Pressable>
  );
}

export default function OnboardingReportTemplateScreen({ navigation }) {
  const [options, setOptions] = useState(null);
  const [recipients, setRecipients] = useState([]);
  const [titleText, setTitleText] = useState("");
  const [columns, setColumns] = useState([]);
  const [sortField, setSortField] = useState("date");
  const [sortDirection, setSortDirection] = useState("asc");
  const [groupField, setGroupField] = useState(null);
  const [showTotalsRow, setShowTotalsRow] = useState(true);
  const [undatedBills, setUndatedBills] = useState("last");
  const [remarksRecipientId, setRemarksRecipientId] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    Promise.all([api.getReportTemplateOptions(), api.listRecipients()])
      .then(([opts, recipientList]) => {
        const d = opts.defaults;
        setTitleText(d.titleText);
        setColumns(d.columns);
        setSortField(d.sortField);
        setSortDirection(d.sortDirection);
        setGroupField(d.groupField);
        setShowTotalsRow(d.showTotalsRow);
        setUndatedBills(d.undatedBills);
        setRecipients(recipientList);
        setOptions(opts);
      })
      .catch((e) => setError(e.message));
  }, []);

  // Keep columns in the canonical order and drop sort/group choices that
  // point at a column the user just removed.
  const toggleColumn = (key) => {
    const next = columns.includes(key)
      ? columns.filter((c) => c !== key)
      : options.columns.map((c) => c.key).filter((k) => k === key || columns.includes(k));
    setColumns(next);
    if (!next.includes(sortField)) setSortField(next[0] ?? null);
    if (groupField && !next.includes(groupField)) setGroupField(null);
  };

  const onFinish = async () => {
    if (!titleText.trim()) {
      setError("Report title is required");
      return;
    }
    if (columns.length === 0) {
      setError("Pick at least one column");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await api.createReportTemplate({
        name: titleText.trim(),
        titleText: titleText.trim(),
        columns,
        sortField,
        sortDirection,
        groupField,
        showTotalsRow,
        undatedBills,
        remarksRecipientId,
      });
      navigation.navigate(nextRoute(ROUTE));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  if (!options) {
    return (
      <ScrollView contentContainerStyle={s.container}>
        {error ? <Text style={s.error}>{error}</Text> : <ActivityIndicator color="#1F3864" />}
      </ScrollView>
    );
  }

  const labelFor = (key) => options.columns.find((c) => c.key === key)?.label ?? key;
  const groupable = columns.filter((c) => options.groupableColumns.includes(c));

  return (
    <ScrollView contentContainerStyle={s.container}>
      <Text style={s.step}>{stepLabel(ROUTE)}</Text>
      <Text style={s.title}>Your batch summary report</Text>
      <Text style={s.subtitle}>
        When you group invoices into a batch, this is the summary schedule you can generate for
        it. You can create more report layouts later.
      </Text>

      <Text style={s.label}>Report title</Text>
      <TextInput
        style={s.input}
        placeholder='e.g. "Annexure 1", "Schedule A"'
        value={titleText}
        onChangeText={setTitleText}
      />

      <Text style={s.label}>Columns</Text>
      <View style={s.chipRow}>
        {options.columns.map((c) => (
          <Chip
            key={c.key}
            label={c.label}
            selected={columns.includes(c.key)}
            onPress={() => toggleColumn(c.key)}
          />
        ))}
      </View>

      <Text style={s.label}>Sort by</Text>
      <View style={s.chipRow}>
        {columns.map((key) => (
          <Chip key={key} label={labelFor(key)} selected={sortField === key} onPress={() => setSortField(key)} />
        ))}
      </View>
      <View style={s.chipRow}>
        <Chip label="Ascending" selected={sortDirection === "asc"} onPress={() => setSortDirection("asc")} />
        <Chip label="Descending" selected={sortDirection === "desc"} onPress={() => setSortDirection("desc")} />
      </View>

      <Text style={s.label}>Group by</Text>
      <View style={s.chipRow}>
        <Chip label="No grouping" selected={groupField === null} onPress={() => setGroupField(null)} />
        {groupable.map((key) => (
          <Chip key={key} label={labelFor(key)} selected={groupField === key} onPress={() => setGroupField(key)} />
        ))}
      </View>

      <View style={s.switchRow}>
        <Text style={s.label}>Totals row</Text>
        <Switch value={showTotalsRow} onValueChange={setShowTotalsRow} />
      </View>

      <Text style={s.label}>Bills with no date</Text>
      <View style={s.chipRow}>
        <Chip label="List them last" selected={undatedBills === "last"} onPress={() => setUndatedBills("last")} />
        <Chip label="Leave them out" selected={undatedBills === "exclude"} onPress={() => setUndatedBills("exclude")} />
      </View>

      {recipients.length > 0 ? (
        <>
          <Text style={s.label}>Remarks text from</Text>
          <View style={s.chipRow}>
            <Chip label="None" selected={remarksRecipientId === null} onPress={() => setRemarksRecipientId(null)} />
            {recipients.map((r) => (
              <Chip
                key={r.id}
                label={r.name}
                selected={remarksRecipientId === r.id}
                onPress={() => setRemarksRecipientId(r.id)}
              />
            ))}
          </View>
        </>
      ) : null}

      {error ? <Text style={s.error}>{error}</Text> : null}

      <Pressable style={s.button} onPress={onFinish} disabled={loading}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.buttonText}>Finish Setup</Text>}
      </Pressable>
    </ScrollView>
  );
}
