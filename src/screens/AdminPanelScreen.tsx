import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { AppTabPermissionKey, AppUser, AppUserPermissions } from '../types/inventory';
import {
  EMPTY_USER_PERMISSIONS,
  archiveUser,
  createUser,
  listUsers,
  updateUser,
} from '../database/auth.repository';
import { SyncStatusCard } from '../components/SyncStatusCard';
import { syncAppData } from '../database/sync.service';

type AdminPanelScreenProps = {
  currentUser: AppUser;
  onUsersChanged?: () => Promise<void> | void;
};

type UserFormState = {
  username: string;
  functionName: string;
  password: string;
  isAdmin: boolean;
  permissions: AppUserPermissions;
};

type FormErrors = Partial<Record<'username' | 'functionName' | 'password' | 'permissions' | 'submit', string>>;

const TAB_PERMISSION_OPTIONS: Array<{ key: AppTabPermissionKey; label: string }> = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'stock', label: 'Estoque' },
  { key: 'items', label: 'Itens' },
  { key: 'entry', label: 'Entrada' },
  { key: 'exit', label: 'Saida' },
  { key: 'history', label: 'Historico' },
];

const INITIAL_CREATE_FORM: UserFormState = {
  username: '',
  functionName: '',
  password: '',
  isAdmin: false,
  permissions: { ...EMPTY_USER_PERMISSIONS },
};

function hasAtLeastOnePermission(permissions: AppUserPermissions): boolean {
  return Object.values(permissions).some((value) => value);
}

function formatPermissions(permissions: AppUserPermissions): string {
  return TAB_PERMISSION_OPTIONS
    .filter((option) => permissions[option.key])
    .map((option) => option.label)
    .join(', ');
}

function buildCreateValidation(form: UserFormState): FormErrors {
  const errors: FormErrors = {};

  if (form.username.trim().length === 0) {
    errors.username = 'Informe o usuario.';
  }

  if (form.functionName.trim().length === 0) {
    errors.functionName = 'Informe a funcao.';
  }

  if (form.password.length === 0) {
    errors.password = 'Informe a senha inicial.';
  }

  if (!hasAtLeastOnePermission(form.permissions)) {
    errors.permissions = 'Marque pelo menos uma aba para este usuario.';
  }

  return errors;
}

function buildUpdateValidation(form: UserFormState): FormErrors {
  const errors: FormErrors = {};

  if (form.username.trim().length === 0) {
    errors.username = 'Informe o usuario.';
  }

  if (form.functionName.trim().length === 0) {
    errors.functionName = 'Informe a funcao.';
  }

  if (!hasAtLeastOnePermission(form.permissions)) {
    errors.permissions = 'Marque pelo menos uma aba para este usuario.';
  }

  return errors;
}

async function confirmAction(message: string): Promise<boolean> {
  if (Platform.OS === 'web') {
    if (typeof globalThis.confirm === 'function') {
      return globalThis.confirm(message);
    }

    return true;
  }

  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: boolean) => {
      if (!settled) {
        settled = true;
        resolve(value);
      }
    };

    Alert.alert(
      'Confirmar',
      message,
      [
        { text: 'Cancelar', style: 'cancel', onPress: () => finish(false) },
        { text: 'Confirmar', style: 'destructive', onPress: () => finish(true) },
      ],
      { cancelable: true, onDismiss: () => finish(false) },
    );
  });
}

type PermissionSelectorProps = {
  value: AppUserPermissions;
  onToggle: (tab: AppTabPermissionKey) => void;
};

function PermissionSelector({ value, onToggle }: PermissionSelectorProps) {
  return (
    <View style={styles.permissionGrid}>
      {TAB_PERMISSION_OPTIONS.map((option) => {
        const selected = value[option.key];

        return (
          <Pressable
            key={option.key}
            style={[
              styles.permissionChip,
              selected ? styles.permissionChipActive : undefined,
            ]}
            onPress={() => onToggle(option.key)}
          >
            <Text
              style={[
                styles.permissionChipText,
                selected ? styles.permissionChipTextActive : undefined,
              ]}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function AdminPanelScreen({ currentUser, onUsersChanged }: AdminPanelScreenProps) {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingUserId, setEditingUserId] = useState<number | null>(null);
  const [createForm, setCreateForm] = useState<UserFormState>(INITIAL_CREATE_FORM);
  const [editForm, setEditForm] = useState<UserFormState>(INITIAL_CREATE_FORM);
  const [createErrors, setCreateErrors] = useState<FormErrors>({});
  const [editErrors, setEditErrors] = useState<FormErrors>({});
  const [feedbackMessage, setFeedbackMessage] = useState('');

  async function loadUsers(syncFirst: boolean = false) {
    setIsLoading(true);

    try {
      if (syncFirst) {
        await syncAppData();
      }

      const data = await listUsers();
      setUsers(data);
    } catch (error) {
      setCreateErrors((prev) => ({
        ...prev,
        submit: error instanceof Error ? error.message : 'Falha ao carregar usuarios.',
      }));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadUsers(true);
  }, []);

  function setCreateField<K extends keyof UserFormState>(key: K, value: UserFormState[K]) {
    setCreateForm((prev) => ({ ...prev, [key]: value }));
    setCreateErrors((prev) => ({ ...prev, [key]: undefined, submit: undefined }));
    setFeedbackMessage('');
  }

  function setEditField<K extends keyof UserFormState>(key: K, value: UserFormState[K]) {
    setEditForm((prev) => ({ ...prev, [key]: value }));
    setEditErrors((prev) => ({ ...prev, [key]: undefined, submit: undefined }));
    setFeedbackMessage('');
  }

  function startEditing(user: AppUser) {
    setEditingUserId(user.id);
    setEditForm({
      username: user.username,
      functionName: user.functionName,
      password: '',
      isAdmin: user.isAdmin,
      permissions: { ...user.permissions },
    });
    setEditErrors({});
    setFeedbackMessage('');
  }

  function cancelEditing() {
    setEditingUserId(null);
    setEditForm(INITIAL_CREATE_FORM);
    setEditErrors({});
    setFeedbackMessage('');
  }

  async function notifyUsersChanged() {
    if (!onUsersChanged) {
      return;
    }

    await onUsersChanged();
  }

  async function handleCreateUser() {
    const validation = buildCreateValidation(createForm);
    if (Object.keys(validation).length > 0) {
      setCreateErrors(validation);
      return;
    }

    setIsSubmitting(true);
    setCreateErrors({});

    try {
      await createUser({
        username: createForm.username,
        password: createForm.password,
        functionName: createForm.functionName,
        isAdmin: createForm.isAdmin,
        permissions: createForm.permissions,
      });

      setCreateForm(INITIAL_CREATE_FORM);
      setFeedbackMessage('Usuario criado com sucesso.');
      await loadUsers();
      await notifyUsersChanged();
    } catch (error) {
      setCreateErrors((prev) => ({
        ...prev,
        submit: error instanceof Error ? error.message : 'Falha ao criar usuario.',
      }));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleUpdateUser(userId: number) {
    const validation = buildUpdateValidation(editForm);
    if (Object.keys(validation).length > 0) {
      setEditErrors(validation);
      return;
    }

    setIsSubmitting(true);
    setEditErrors({});

    try {
      await updateUser(userId, {
        username: editForm.username,
        functionName: editForm.functionName,
        password: editForm.password,
        isAdmin: editForm.isAdmin,
        permissions: editForm.permissions,
      });
      setFeedbackMessage('Usuario atualizado com sucesso.');
      cancelEditing();
      await loadUsers();
      await notifyUsersChanged();
    } catch (error) {
      setEditErrors((prev) => ({
        ...prev,
        submit: error instanceof Error ? error.message : 'Falha ao atualizar usuario.',
      }));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleArchiveUser(user: AppUser) {
    const confirmed = await confirmAction(`Deseja excluir o usuario ${user.username}?`);
    if (!confirmed) {
      return;
    }

    setIsSubmitting(true);
    setEditErrors((prev) => ({ ...prev, submit: undefined }));

    try {
      await archiveUser(user.id);
      setFeedbackMessage('Usuario excluido com sucesso.');
      if (editingUserId === user.id) {
        cancelEditing();
      }
      await loadUsers();
      await notifyUsersChanged();
    } catch (error) {
      setEditErrors((prev) => ({
        ...prev,
        submit: error instanceof Error ? error.message : 'Falha ao excluir usuario.',
      }));
    } finally {
      setIsSubmitting(false);
    }
  }

  const adminCount = useMemo(() => users.filter((user) => user.isAdmin).length, [users]);

  return (
    <View style={styles.container}>
      <FlatList
        data={users}
        keyExtractor={(user) => String(user.id)}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={() => {
              void loadUsers(true);
            }}
          />
        }
        ListHeaderComponent={
          <View style={styles.headerBlock}>
            <SyncStatusCard />

            <View style={styles.heroCard}>
              <Text style={styles.title}>Painel ADM</Text>
              <Text style={styles.subtitle}>
                Gerencie usuarios, funcoes e permissoes de abas.
              </Text>
              <Text style={styles.summaryText}>
                Usuarios ativos: {users.length} | Administradores: {adminCount}
              </Text>
            </View>

            <View style={styles.formCard}>
              <Text style={styles.formTitle}>Novo usuario</Text>

              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Usuario</Text>
                <TextInput
                  value={createForm.username}
                  onChangeText={(value) => setCreateField('username', value)}
                  placeholder="Ex.: joao"
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={[styles.input, createErrors.username ? styles.inputError : undefined]}
                />
                {createErrors.username ? <Text style={styles.errorText}>{createErrors.username}</Text> : null}
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Funcao</Text>
                <TextInput
                  value={createForm.functionName}
                  onChangeText={(value) => setCreateField('functionName', value)}
                  placeholder="Ex.: Operador de estoque"
                  style={[styles.input, createErrors.functionName ? styles.inputError : undefined]}
                />
                {createErrors.functionName ? <Text style={styles.errorText}>{createErrors.functionName}</Text> : null}
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Senha inicial</Text>
                <TextInput
                  value={createForm.password}
                  onChangeText={(value) => setCreateField('password', value)}
                  placeholder="Defina uma senha"
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={[styles.input, createErrors.password ? styles.inputError : undefined]}
                />
                {createErrors.password ? <Text style={styles.errorText}>{createErrors.password}</Text> : null}
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Permissoes de abas</Text>
                <PermissionSelector
                  value={createForm.permissions}
                  onToggle={(tabKey) => {
                    setCreateField('permissions', {
                      ...createForm.permissions,
                      [tabKey]: !createForm.permissions[tabKey],
                    });
                  }}
                />
                {createErrors.permissions ? <Text style={styles.errorText}>{createErrors.permissions}</Text> : null}
              </View>

              <Pressable
                style={[styles.toggleButton, createForm.isAdmin ? styles.toggleButtonActive : undefined]}
                onPress={() => setCreateField('isAdmin', !createForm.isAdmin)}
              >
                <Text style={[styles.toggleButtonText, createForm.isAdmin ? styles.toggleButtonTextActive : undefined]}>
                  {createForm.isAdmin ? 'Administrador: Sim' : 'Administrador: Nao'}
                </Text>
              </Pressable>

              {createErrors.submit ? <Text style={styles.errorText}>{createErrors.submit}</Text> : null}
              {feedbackMessage ? <Text style={styles.successText}>{feedbackMessage}</Text> : null}

              <Pressable
                style={[styles.submitButton, isSubmitting ? styles.submitButtonDisabled : undefined]}
                disabled={isSubmitting}
                onPress={() => {
                  void handleCreateUser();
                }}
              >
                {isSubmitting ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.submitButtonText}>Criar usuario</Text>
                )}
              </Pressable>
            </View>

            <Text style={styles.listTitle}>Usuarios cadastrados</Text>
          </View>
        }
        ListEmptyComponent={
          isLoading ? (
            <Text style={styles.emptyText}>Carregando usuarios...</Text>
          ) : (
            <Text style={styles.emptyText}>Nenhum usuario ativo.</Text>
          )
        }
        renderItem={({ item }) => {
          const isCurrentUser = item.id === currentUser.id;
          const isEditing = editingUserId === item.id;

          return (
            <View style={styles.userCard}>
              <View style={styles.userHeader}>
                <Text style={styles.userName}>{item.username}</Text>
                <View style={styles.badges}>
                  {item.isAdmin ? (
                    <View style={[styles.badge, styles.adminBadge]}>
                      <Text style={styles.adminBadgeText}>ADM</Text>
                    </View>
                  ) : null}
                  {isCurrentUser ? (
                    <View style={[styles.badge, styles.selfBadge]}>
                      <Text style={styles.selfBadgeText}>Voce</Text>
                    </View>
                  ) : null}
                </View>
              </View>

              {!isEditing ? (
                <>
                  <Text style={styles.userMeta}>Funcao: {item.functionName}</Text>
                  <Text style={styles.userMeta}>
                    Abas: {formatPermissions(item.permissions) || 'Nenhuma'}
                  </Text>
                  {!isCurrentUser ? (
                    <Pressable style={styles.editButton} onPress={() => startEditing(item)}>
                      <Text style={styles.editButtonText}>Editar</Text>
                    </Pressable>
                  ) : (
                    <Text style={styles.selfHint}>Seu proprio usuario nao pode ser editado/excluido aqui.</Text>
                  )}
                </>
              ) : (
                <View style={styles.editCard}>
                  <View style={styles.fieldGroup}>
                    <Text style={styles.label}>Usuario</Text>
                    <TextInput
                      value={editForm.username}
                      onChangeText={(value) => setEditField('username', value)}
                      autoCapitalize="none"
                      autoCorrect={false}
                      style={[styles.input, editErrors.username ? styles.inputError : undefined]}
                    />
                    {editErrors.username ? <Text style={styles.errorText}>{editErrors.username}</Text> : null}
                  </View>

                  <View style={styles.fieldGroup}>
                    <Text style={styles.label}>Funcao</Text>
                    <TextInput
                      value={editForm.functionName}
                      onChangeText={(value) => setEditField('functionName', value)}
                      style={[styles.input, editErrors.functionName ? styles.inputError : undefined]}
                    />
                    {editErrors.functionName ? <Text style={styles.errorText}>{editErrors.functionName}</Text> : null}
                  </View>

                  <View style={styles.fieldGroup}>
                    <Text style={styles.label}>Permissoes de abas</Text>
                    <PermissionSelector
                      value={editForm.permissions}
                      onToggle={(tabKey) => {
                        setEditField('permissions', {
                          ...editForm.permissions,
                          [tabKey]: !editForm.permissions[tabKey],
                        });
                      }}
                    />
                    {editErrors.permissions ? <Text style={styles.errorText}>{editErrors.permissions}</Text> : null}
                  </View>

                  <Pressable
                    style={[styles.toggleButton, editForm.isAdmin ? styles.toggleButtonActive : undefined]}
                    onPress={() => setEditField('isAdmin', !editForm.isAdmin)}
                  >
                    <Text style={[styles.toggleButtonText, editForm.isAdmin ? styles.toggleButtonTextActive : undefined]}>
                      {editForm.isAdmin ? 'Administrador: Sim' : 'Administrador: Nao'}
                    </Text>
                  </Pressable>

                  <View style={styles.fieldGroup}>
                    <Text style={styles.label}>Nova senha (opcional)</Text>
                    <TextInput
                      value={editForm.password}
                      onChangeText={(value) => setEditField('password', value)}
                      placeholder="Nova senha"
                      secureTextEntry
                      autoCapitalize="none"
                      autoCorrect={false}
                      style={styles.input}
                    />
                  </View>

                  {editErrors.submit ? <Text style={styles.errorText}>{editErrors.submit}</Text> : null}

                  <View style={styles.editActions}>
                    <Pressable
                      style={styles.cancelButton}
                      disabled={isSubmitting}
                      onPress={cancelEditing}
                    >
                      <Text style={styles.cancelButtonText}>Cancelar</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.deleteButton, isSubmitting ? styles.submitButtonDisabled : undefined]}
                      disabled={isSubmitting}
                      onPress={() => {
                        void handleArchiveUser(item);
                      }}
                    >
                      <Text style={styles.submitButtonText}>Excluir</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.submitButton, styles.editSaveButton, isSubmitting ? styles.submitButtonDisabled : undefined]}
                      disabled={isSubmitting}
                      onPress={() => {
                        void handleUpdateUser(item.id);
                      }}
                    >
                      <Text style={styles.submitButtonText}>Salvar</Text>
                    </Pressable>
                  </View>
                </View>
              )}
            </View>
          );
        }}
        contentContainerStyle={styles.listContent}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F3FF',
  },
  listContent: {
    padding: 16,
    paddingBottom: 24,
    gap: 12,
  },
  headerBlock: {
    gap: 12,
    marginBottom: 6,
  },
  heroCard: {
    backgroundColor: '#5B21B6',
    borderRadius: 18,
    padding: 16,
    gap: 8,
  },
  title: {
    color: '#F5F3FF',
    fontSize: 24,
    fontWeight: '800',
  },
  subtitle: {
    color: '#EDE9FE',
    fontSize: 14,
    lineHeight: 20,
  },
  summaryText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  formCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#DDD6FE',
    padding: 16,
    gap: 10,
  },
  formTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#4C1D95',
  },
  fieldGroup: {
    gap: 6,
  },
  label: {
    fontSize: 13,
    color: '#6D28D9',
    fontWeight: '700',
  },
  input: {
    borderWidth: 1,
    borderColor: '#C4B5FD',
    backgroundColor: '#FAF5FF',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#3B0764',
    fontSize: 15,
  },
  inputError: {
    borderColor: '#EF4444',
  },
  permissionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  permissionChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#C4B5FD',
    backgroundColor: '#F5F3FF',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  permissionChipActive: {
    borderColor: '#6D28D9',
    backgroundColor: '#DDD6FE',
  },
  permissionChipText: {
    color: '#6D28D9',
    fontSize: 12,
    fontWeight: '700',
  },
  permissionChipTextActive: {
    color: '#4C1D95',
  },
  toggleButton: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#C4B5FD',
    backgroundColor: '#F5F3FF',
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  toggleButtonActive: {
    borderColor: '#6D28D9',
    backgroundColor: '#DDD6FE',
  },
  toggleButtonText: {
    color: '#5B21B6',
    fontSize: 13,
    fontWeight: '700',
  },
  toggleButtonTextActive: {
    color: '#4C1D95',
  },
  submitButton: {
    marginTop: 6,
    backgroundColor: '#7C3AED',
    borderRadius: 12,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  submitButtonDisabled: {
    opacity: 0.7,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  secondaryButton: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#C4B5FD',
    backgroundColor: '#F5F3FF',
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  secondaryButtonText: {
    color: '#5B21B6',
    fontSize: 13,
    fontWeight: '700',
  },
  successText: {
    color: '#5B21B6',
    backgroundColor: '#EDE9FE',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    fontWeight: '600',
  },
  errorText: {
    color: '#B91C1C',
    fontSize: 12,
    lineHeight: 17,
  },
  listTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#4C1D95',
    marginTop: 4,
  },
  emptyText: {
    textAlign: 'center',
    color: '#6D28D9',
    fontSize: 14,
    marginTop: 20,
  },
  userCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DDD6FE',
    borderRadius: 14,
    padding: 14,
    gap: 8,
  },
  userHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  userName: {
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
    color: '#3B0764',
  },
  badges: {
    flexDirection: 'row',
    gap: 6,
  },
  badge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  adminBadge: {
    backgroundColor: '#DDD6FE',
  },
  adminBadgeText: {
    color: '#4C1D95',
    fontSize: 11,
    fontWeight: '700',
  },
  selfBadge: {
    backgroundColor: '#CCFBF1',
  },
  selfBadgeText: {
    color: '#0F766E',
    fontSize: 11,
    fontWeight: '700',
  },
  userMeta: {
    fontSize: 13,
    color: '#5B21B6',
  },
  selfHint: {
    color: '#6D28D9',
    fontSize: 12,
    fontStyle: 'italic',
  },
  editButton: {
    alignSelf: 'flex-start',
    borderRadius: 8,
    backgroundColor: '#EDE9FE',
    borderWidth: 1,
    borderColor: '#C4B5FD',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  editButtonText: {
    color: '#5B21B6',
    fontSize: 12,
    fontWeight: '700',
  },
  editCard: {
    gap: 10,
  },
  editActions: {
    flexDirection: 'row',
    gap: 10,
  },
  cancelButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#C4B5FD',
    borderRadius: 12,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F5F3FF',
    marginTop: 6,
  },
  cancelButtonText: {
    color: '#5B21B6',
    fontSize: 15,
    fontWeight: '700',
  },
  editSaveButton: {
    flex: 1,
  },
  deleteButton: {
    flex: 1,
    marginTop: 6,
    backgroundColor: '#B91C1C',
    borderRadius: 12,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
});
