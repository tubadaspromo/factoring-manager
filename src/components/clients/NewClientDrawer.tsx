/**
 * NewClientDrawer
 *
 * Bottom Sheet que abre sobre o formulário principal de Novo Contrato.
 * O formulário pai NÃO perde o estado — apenas um Drawer é empilhado por cima.
 *
 * Integra com:
 * - expo-contacts: busca contatos do dispositivo
 * - React Hook Form + Zod: validação
 * - Supabase: persiste o cliente antes de retornar
 */

import React, { useCallback, useRef } from "react";
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Animated, {
  FadeIn,
  FadeOut,
  SlideInDown,
  SlideOutDown,
} from "react-native-reanimated";
import * as Contacts from "expo-contacts";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";

import { Colors, Typography, Spacing, Radius, Shadow } from "@/theme";
import { supabase } from "@/lib/supabase";
import type { ClientRow } from "@/types/database.types";

// ─── Schema de validação ──────────────────────────────────────────────────────

const newClientSchema = z.object({
  name:     z.string().min(2, "Nome deve ter ao menos 2 caracteres"),
  nickname: z.string().optional(),
  phone:    z
    .string()
    .optional()
    .refine(
      (v) => !v || /^\+?[\d\s\-().]{8,}$/.test(v),
      "Telefone inválido"
    ),
});

type NewClientForm = z.infer<typeof newClientSchema>;

// ─── Props ────────────────────────────────────────────────────────────────────

interface NewClientDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onClientCreated: (client: ClientRow) => void;
}

// ─── Componente ───────────────────────────────────────────────────────────────

export function NewClientDrawer({
  isOpen,
  onClose,
  onClientCreated,
}: NewClientDrawerProps) {
  if (!isOpen) return null;

  return (
    <Animated.View
      style={StyleSheet.absoluteFillObject}
      entering={FadeIn.duration(200)}
      exiting={FadeOut.duration(150)}
    >
      {/* Backdrop */}
      <Pressable style={styles.backdrop} onPress={onClose} />

      {/* Sheet */}
      <Animated.View
        style={styles.sheet}
        entering={SlideInDown.springify().damping(18).stiffness(200)}
        exiting={SlideOutDown.duration(200)}
      >
        <DrawerContent
          onClose={onClose}
          onClientCreated={onClientCreated}
        />
      </Animated.View>
    </Animated.View>
  );
}

// ─── Conteúdo do drawer ───────────────────────────────────────────────────────

function DrawerContent({
  onClose,
  onClientCreated,
}: Omit<NewClientDrawerProps, "isOpen">) {
  const {
    control,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<NewClientForm>({
    resolver: zodResolver(newClientSchema),
    defaultValues: { name: "", nickname: "", phone: "" },
  });

  // ── Importar do contato ─────────────────────────────────────────────────

  const importFromContacts = useCallback(async () => {
    const { status } = await Contacts.requestPermissionsAsync();

    if (status !== "granted") {
      // Graceful degradation: não forçar, apenas avisar
      alert("Permissão de contatos negada. Preencha os dados manualmente.");
      return;
    }

    const { data } = await Contacts.getContactsAsync({
      fields: [Contacts.Fields.Name, Contacts.Fields.PhoneNumbers],
    });

    if (!data.length) return;

    // Em produção, abrir um ContactPicker modal
    // Para MVP, pega o primeiro contato como demo
    const contact = data[0];
    if (contact.name) setValue("name", contact.name);
    if (contact.phoneNumbers?.[0]?.number) {
      setValue("phone", contact.phoneNumbers[0].number);
    }
  }, [setValue]);

  // ── Mutação: criar cliente ──────────────────────────────────────────────

  const createMutation = useMutation({
    mutationFn: async (data: NewClientForm) => {
      const { data: { user } } = await supabase.auth.getUser();

      const { data: client, error } = await supabase
        .from("clients")
        .insert({
          user_id:  user!.id,
          name:     data.name,
          nickname: data.nickname || null,
          phone:    data.phone || null,
        })
        .select()
        .single<ClientRow>();

      if (error) throw error;
      return client!;
    },
    onSuccess: (client) => {
      Keyboard.dismiss();
      onClientCreated(client);
    },
  });

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentContainerStyle={styles.drawerContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Handle visual */}
        <View style={styles.handle} />

        {/* Header */}
        <View style={styles.drawerHeader}>
          <Text style={styles.drawerTitle}>Novo Cliente</Text>
          <Pressable onPress={onClose} style={styles.closeButton}>
            <Text style={styles.closeIcon}>✕</Text>
          </Pressable>
        </View>

        {/* Importar contato */}
        <Pressable style={styles.importButton} onPress={importFromContacts}>
          <Text style={styles.importIcon}>📱</Text>
          <Text style={styles.importText}>Importar da agenda</Text>
        </Pressable>

        <View style={styles.dividerRow}>
          <View style={styles.divider} />
          <Text style={styles.dividerLabel}>ou preencha manualmente</Text>
          <View style={styles.divider} />
        </View>

        {/* Campos — Dados obrigatórios */}
        <SectionLabel label="Dados obrigatórios" />

        <FieldGroup>
          <Controller
            control={control}
            name="name"
            render={({ field: { onChange, value } }) => (
              <FormField
                label="Nome completo *"
                placeholder="Ex: João da Silva"
                value={value}
                onChangeText={onChange}
                error={errors.name?.message}
                autoCapitalize="words"
              />
            )}
          />
        </FieldGroup>

        {/* Campos — Dados adicionais */}
        <SectionLabel label="Dados adicionais" style={{ marginTop: Spacing["5"] }} />

        <FieldGroup>
          <Controller
            control={control}
            name="nickname"
            render={({ field: { onChange, value } }) => (
              <FormField
                label="Apelido"
                placeholder="Ex: João Padeiro"
                value={value ?? ""}
                onChangeText={onChange}
                error={errors.nickname?.message}
                autoCapitalize="words"
              />
            )}
          />
          <Controller
            control={control}
            name="phone"
            render={({ field: { onChange, value } }) => (
              <FormField
                label="Telefone / WhatsApp"
                placeholder="(11) 99999-9999"
                value={value ?? ""}
                onChangeText={onChange}
                error={errors.phone?.message}
                keyboardType="phone-pad"
              />
            )}
          />
        </FieldGroup>

        {/* Erro de submissão */}
        {createMutation.error && (
          <Text style={styles.submitError}>
            {(createMutation.error as Error).message}
          </Text>
        )}

        {/* CTA */}
        <Pressable
          style={[
            styles.createButton,
            createMutation.isPending && styles.createButtonDisabled,
          ]}
          onPress={handleSubmit((data) => createMutation.mutate(data))}
          disabled={createMutation.isPending}
        >
          {createMutation.isPending ? (
            <ActivityIndicator color={Colors.brand.contrast} />
          ) : (
            <Text style={styles.createButtonText}>Salvar cliente</Text>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ─── Sub-componentes de formulário ────────────────────────────────────────────

function SectionLabel({ label, style }: { label: string; style?: object }) {
  return (
    <Text style={[styles.sectionLabel, style]}>{label}</Text>
  );
}

function FieldGroup({ children }: { children: React.ReactNode }) {
  return <View style={styles.fieldGroup}>{children}</View>;
}

interface FormFieldProps {
  label: string;
  placeholder: string;
  value: string;
  onChangeText: (v: string) => void;
  error?: string;
  autoCapitalize?: "none" | "words" | "sentences";
  keyboardType?: "default" | "phone-pad" | "email-address";
}

function FormField({
  label,
  placeholder,
  value,
  onChangeText,
  error,
  autoCapitalize = "sentences",
  keyboardType = "default",
}: FormFieldProps) {
  return (
    <View style={styles.fieldWrapper}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={[styles.input, error && styles.inputError]}
        placeholder={placeholder}
        placeholderTextColor={Colors.text.tertiary}
        value={value}
        onChangeText={onChangeText}
        autoCapitalize={autoCapitalize}
        keyboardType={keyboardType}
      />
      {error && <Text style={styles.fieldError}>{error}</Text>}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  sheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: Colors.bg.surface,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    maxHeight: "90%",
    ...Shadow.md,
  },
  drawerContent: {
    padding: Spacing["5"],
    paddingBottom: Platform.OS === "ios" ? Spacing["10"] : Spacing["6"],
  },

  // Handle
  handle: {
    width: 36,
    height: 4,
    borderRadius: Radius.full,
    backgroundColor: Colors.bg.overlay,
    alignSelf: "center",
    marginBottom: Spacing["4"],
  },

  // Header
  drawerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing["5"],
  },
  drawerTitle: {
    fontFamily: Typography.family.heading,
    fontSize: Typography.size.xl,
    color: Colors.text.primary,
  },
  closeButton: {
    padding: Spacing["2"],
  },
  closeIcon: {
    fontSize: Typography.size.md,
    color: Colors.text.secondary,
  },

  // Import
  importButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing["2"],
    backgroundColor: Colors.bg.elevated,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: Spacing["3"],
    marginBottom: Spacing["4"],
  },
  importIcon: { fontSize: Typography.size.md },
  importText: {
    fontFamily: Typography.family.bodyMedium,
    fontSize: Typography.size.base,
    color: Colors.brand.default,
  },

  // Divider
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing["3"],
    marginBottom: Spacing["5"],
  },
  divider: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.separator,
  },
  dividerLabel: {
    fontFamily: Typography.family.body,
    fontSize: Typography.size.xs,
    color: Colors.text.tertiary,
  },

  // Section
  sectionLabel: {
    fontFamily: Typography.family.bodyMedium,
    fontSize: Typography.size.xs,
    color: Colors.text.secondary,
    letterSpacing: Typography.letterSpacing.wider,
    textTransform: "uppercase",
    marginBottom: Spacing["3"],
  },

  // FieldGroup
  fieldGroup: {
    backgroundColor: Colors.bg.elevated,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: "hidden",
  },

  // Field
  fieldWrapper: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.separator,
    paddingHorizontal: Spacing["4"],
    paddingVertical: Spacing["3"],
  },
  fieldLabel: {
    fontFamily: Typography.family.body,
    fontSize: Typography.size.xs,
    color: Colors.text.secondary,
    marginBottom: Spacing["1"],
  },
  input: {
    fontFamily: Typography.family.bodyMedium,
    fontSize: Typography.size.md,
    color: Colors.text.primary,
    paddingVertical: Spacing["1"],
  },
  inputError: {
    color: Colors.status.overdue.text,
  },
  fieldError: {
    fontFamily: Typography.family.body,
    fontSize: Typography.size.xs,
    color: Colors.status.overdue.text,
    marginTop: Spacing["1"],
  },

  // Submit
  submitError: {
    fontFamily: Typography.family.body,
    fontSize: Typography.size.sm,
    color: Colors.status.overdue.text,
    textAlign: "center",
    marginVertical: Spacing["3"],
  },
  createButton: {
    height: 52,
    backgroundColor: Colors.brand.default,
    borderRadius: Radius.lg,
    justifyContent: "center",
    alignItems: "center",
    marginTop: Spacing["6"],
    ...Shadow.brand,
  },
  createButtonDisabled: {
    backgroundColor: Colors.bg.elevated,
  },
  createButtonText: {
    fontFamily: Typography.family.bodySemiBold,
    fontSize: Typography.size.md,
    color: Colors.brand.contrast,
  },
});
