import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Papa from 'papaparse';
import { ThemeProvider, createTheme, CssBaseline } from '@mui/material';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import TextField from '@mui/material/TextField';
import Chip from '@mui/material/Chip';
import InputAdornment from '@mui/material/InputAdornment';
import CircularProgress from '@mui/material/CircularProgress';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import Alert from '@mui/material/Alert';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import DialogContentText from '@mui/material/DialogContentText';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import SearchIcon from '@mui/icons-material/Search';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import DoneIcon from '@mui/icons-material/Done';
import Brightness6Icon from '@mui/icons-material/Brightness6';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import SecurityIcon from '@mui/icons-material/Security';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import WarningIcon from '@mui/icons-material/Warning';
import { CsvRow, PointsPossibleMap, StudentIndexItem } from './types';

type LoadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'loaded'; rows: CsvRow[]; points: PointsPossibleMap; header: string[] }
  | { status: 'error'; message: string };

const IDENTITY_COLUMNS = new Set([
  'LastName',
  'FirstName',
  'ID',
  'SIS User ID',
  'SIS Login ID',
  'Root Account',
  'Section',
  'Notes',
]);

function readBooleanPreference(key: string, fallback: boolean): boolean {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return raw === 'true';
  } catch {
    return fallback;
  }
}

function isNumeric(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (trimmed.length === 0) return false;
  const num = Number(trimmed);
  return Number.isFinite(num);
}

function toNumber(value: unknown): number | null {
  return isNumeric(value) ? Number(String(value).trim()) : null;
}

function toTitleCase(str: string): string {
  return str.replace(/\w\S*/g, (txt) => {
    const lower = txt.toLowerCase();
    // Handle Roman numerals
    if (/^(i{1,3}|iv|v|vi{0,3}|ix|x|xi{0,3}|xiv|xv|xvi{0,3}|xix|xx)$/i.test(lower)) {
      return txt.toUpperCase();
    }
    // Handle common abbreviations that should be uppercase
    if (/^(jr|sr|ii|iii|iv|v|vi|vii|viii|ix|x)$/i.test(lower)) {
      return txt.toUpperCase();
    }
    // Regular title case
    return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
  });
}

export default function App(): JSX.Element {
  const [state, setState] = useState<LoadState>({ status: 'idle' });
  const [query, setQuery] = useState('');
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [showStatus, setShowStatus] = useState<boolean>(() =>
    readBooleanPreference('showStatus', false)
  );
  const [collapsed, setCollapsed] = useState<boolean>(() =>
    readBooleanPreference('collapsed', false)
  );
  const [consultationMode, setConsultationMode] = useState<boolean>(() =>
    readBooleanPreference('consultationMode', false)
  );
  const [pendingStudentKey, setPendingStudentKey] = useState<string | null>(null);
  const [consultationStartTime, setConsultationStartTime] = useState<number | null>(null);
  const [consultationShowScores, setConsultationShowScores] = useState<boolean>(() =>
    readBooleanPreference('consultationShowScores', false)
  );

  // Dialog states
  const [exitConsultationDialog, setExitConsultationDialog] = useState(false);
  const [enterConsultationDialog, setEnterConsultationDialog] = useState(false);
  const [autoHideScoresDialog, setAutoHideScoresDialog] = useState(false);
  const [navigationWarningDialog, setNavigationWarningDialog] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<(() => void) | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const { studentId } = useParams();
  const [theme, setTheme] = useState<'system' | 'light' | 'dark'>(() => {
    try {
      const saved = localStorage.getItem('theme');
      if (saved === 'light' || saved === 'dark' || saved === 'system') return saved;
      return 'system';
    } catch {
      return 'system';
    }
  });

  // Apply theme to :root data attribute
  useEffect(() => {
    const root = document.documentElement;
    const prefersDark =
      window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const effective = theme === 'system' ? (prefersDark ? 'dark' : 'light') : theme;
    root.setAttribute('data-theme', effective);
  }, [theme]);

  const muiMode = (() => {
    const prefersDark =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-color-scheme: dark)').matches;
    const effective = theme === 'system' ? (prefersDark ? 'dark' : 'light') : theme;
    return effective === 'dark' ? 'dark' : 'light';
  })();

  const muiTheme = useMemo(
    () =>
      createTheme({
        palette: {
          mode: muiMode,
          primary: { main: muiMode === 'dark' ? '#5ab0ff' : '#2563eb' },
        },
        shape: { borderRadius: 10 },
        typography: {
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", Inter, ui-sans-serif, system-ui, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        },
      }),
    [muiMode]
  );

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    (async () => {
      try {
        const res = await fetch('/grades.csv');
        if (!res.ok) throw new Error(`Failed to fetch CSV (${res.status})`);
        const csvText = await res.text();
        const parsed = Papa.parse<CsvRow>(csvText, {
          header: true,
          dynamicTyping: false,
          skipEmptyLines: 'greedy',
        });

        if (parsed.errors?.length) {
          // Keep silent in production, but don't throw
        }

        const header = parsed.meta.fields ?? [];
        const rows = (parsed.data as CsvRow[]).filter(Boolean);

        // Identify the Points Possible row (in LastName column, usually with extra spaces)
        const pointsRow = rows.find(
          (r) =>
            String(r.LastName ?? '')
              .trim()
              .toLowerCase() === 'points possible'
        );
        const points: PointsPossibleMap = {};
        if (pointsRow) {
          for (const key of header) {
            if (!key) continue;
            const v = (pointsRow as CsvRow)[key];
            if (isNumeric(v)) {
              points[key] = Number(v);
            }
          }
        }

        // Helper: detect rows that simply repeat header names as values
        const isHeaderEchoRow = (row: CsvRow): boolean => {
          let matches = 0;
          for (const key of header) {
            if (!key) continue;
            const value = (row as CsvRow)[key];
            if (value === undefined || value === null) continue;
            const v = String(value).trim().toLowerCase();
            const k = String(key).trim().toLowerCase();
            if (v !== '' && v === k) matches++;
          }
          return matches >= 3; // at least 3 columns echo their header names
        };

        // Filter out non-student rows (like Points Possible, header rows, test student)
        const preFiltered = rows.filter((r) => {
          const last = String(r.LastName ?? '')
            .trim()
            .toLowerCase();
          const first = String(r.FirstName ?? '')
            .trim()
            .toLowerCase();
          const sisId = String(r['SIS User ID'] ?? r.ID ?? '')
            .trim()
            .toLowerCase();
          const section = String(r.Section ?? '')
            .trim()
            .toLowerCase();
          if (last === 'points possible') return false;
          // Drop any header-like repeated row that may appear in the CSV body
          if (last === 'lastname' && first === 'firstname') return false;
          if (sisId === 'sis user id') return false;
          if (section === 'section' && !last && !first) return false;
          if (isHeaderEchoRow(r)) return false;
          if (last === '' && first === '') return false;
          if (last === 'student' && first === 'test') return false; // exclude Canvas test student
          return true;
        });

        // De-duplicate by SIS User ID (fallback to ID or name)
        const seen = new Set<string>();
        const studentRows = preFiltered.filter((r) => {
          const key = String(r['SIS User ID'] ?? r.ID ?? `${r.LastName ?? ''}|${r.FirstName ?? ''}`)
            .trim()
            .toLowerCase();
          if (!key) return false;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });

        if (!cancelled) setState({ status: 'loaded', rows: studentRows, points, header });
      } catch (err) {
        if (!cancelled)
          setState({
            status: 'error',
            message: err instanceof Error ? err.message : 'Unknown error',
          });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const index: StudentIndexItem[] = useMemo(() => {
    if (state.status !== 'loaded') return [];
    const withIdx = state.rows
      .map((r, i) => ({
        key: `${String(r['SIS User ID'] ?? r.ID ?? '').trim()}-${i}`,
        rowIndex: i,
        lastName: String(r.LastName ?? '').trim(),
        firstName: String(r.FirstName ?? '').trim(),
        displayName: `${String(r.LastName ?? '').trim()}, ${String(r.FirstName ?? '').trim()}`,
      }))
      .filter((s) => s.lastName || s.firstName);

    // compute simple failure flag using available grade columns if present
    const failed = (i: number): boolean => {
      const r = state.rows[i];
      const fg = Number(r['Unposted Final Grade'] ?? r['Final Grade']);
      if (Number.isFinite(fg)) return fg < 1.0;
      // fall back: check Current Grade or Final Score percent-like columns if ever provided; otherwise leave as not failed
      return false;
    };

    // sort: failed first, then by last/first name
    return withIdx.sort((a, b) => {
      const af = failed(a.rowIndex) ? 1 : 0;
      const bf = failed(b.rowIndex) ? 1 : 0;
      if (af !== bf) return bf - af; // failed (1) before not failed (0)
      return a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName);
    });
  }, [state]);

  // Sync selected student with route param
  useEffect(() => {
    if (index.length === 0) return;
    if (studentId) {
      const found = index.find((s) => s.key.startsWith(`${studentId}-`));
      if (found) {
        setActiveKey(found.key);
        return;
      }
    }
    if (!activeKey) setActiveKey(index[0].key);
  }, [index, studentId, activeKey]);

  const activeStudent = useMemo(() => {
    if (state.status !== 'loaded' || !activeKey) return null;
    const found = state.rows.find((r, i) => {
      const sis = String(r['SIS User ID'] ?? r.ID ?? '').trim();
      return `${sis}-${i}` === activeKey;
    });
    return found ?? null;
  }, [state, activeKey]);

  const filteredIndex = useMemo(() => {
    if (!query) return index;
    const q = query.toLowerCase();
    return index.filter(
      (s) => s.displayName.toLowerCase().includes(q) || s.key.toLowerCase().includes(q)
    );
  }, [query, index]);

  const assignmentKeys = useMemo(() => {
    if (state.status !== 'loaded') return [] as string[];
    // Use Points Possible row to choose assignment columns (numeric max), and ignore identity columns
    const keys = Object.keys(state.points)
      .filter((k) => !IDENTITY_COLUMNS.has(k))
      .filter((k) => typeof state.points[k] === 'number');
    return keys;
  }, [state]);

  // Handle student switching with confirmation in consultation mode
  const handleStudentSwitch = (newKey: string, sisId: string) => {
    // Always default to hidden scores when switching students
    try {
      localStorage.setItem('showScores', 'false');
      localStorage.setItem('consultationShowScores', 'false');
    } catch {}
    setConsultationShowScores(false);
    if (consultationMode && activeKey && activeKey !== newKey) {
      setPendingStudentKey(newKey);
    } else {
      setActiveKey(newKey);
      if (sisId) navigate(`/student/${encodeURIComponent(sisId)}`);
    }
  };

  const confirmStudentSwitch = () => {
    if (pendingStudentKey) {
      setActiveKey(pendingStudentKey);
      const targetStudent = index.find((s) => s.key === pendingStudentKey);
      if (targetStudent) {
        const sisId = String(
          state.status === 'loaded'
            ? (state.rows[targetStudent.rowIndex]['SIS User ID'] ??
                state.rows[targetStudent.rowIndex].ID ??
                '')
            : ''
        ).trim();
        if (sisId) navigate(`/student/${encodeURIComponent(sisId)}`);
      }
      setPendingStudentKey(null);
    }
  };

  const cancelStudentSwitch = () => {
    setPendingStudentKey(null);
  };

  // Keyboard navigation protection
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (consultationMode) {
        // Block common navigation shortcuts
        if (
          (e.ctrlKey || e.metaKey) &&
          (e.key === 'r' || // Refresh
            e.key === 'R' ||
            e.key === 'l' || // Location bar
            e.key === 'L' ||
            e.key === 'h' || // History
            e.key === 'H' ||
            e.key === 't' || // New tab
            e.key === 'T' ||
            e.key === 'w' || // Close tab
            e.key === 'W')
        ) {
          e.preventDefault();
          e.stopPropagation();
        }

        // Block F5 refresh
        if (e.key === 'F5') {
          e.preventDefault();
          e.stopPropagation();
        }

        // Block Alt+Tab (attempt)
        if (e.altKey && e.key === 'Tab') {
          e.preventDefault();
          e.stopPropagation();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [consultationMode]);

  // Browser navigation protection
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (consultationMode) {
        e.preventDefault();
        e.returnValue = 'You are in consultation mode. Are you sure you want to leave?';
        return e.returnValue;
      }
    };

    const handlePopState = (e: PopStateEvent) => {
      if (consultationMode) {
        e.preventDefault();
        // Push current state back to prevent navigation
        window.history.pushState(null, '', window.location.href);
        // Show dialog
        setNavigationWarningDialog(true);
        setPendingNavigation(() => () => {
          setConsultationMode(false);
          try {
            localStorage.setItem('consultationMode', 'false');
          } catch {}
        });
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('popstate', handlePopState);
    };
  }, [consultationMode]);

  // Track consultation session
  useEffect(() => {
    if (consultationMode && !consultationStartTime) {
      setConsultationStartTime(Date.now());
    } else if (!consultationMode && consultationStartTime) {
      setConsultationStartTime(null);
    }
  }, [consultationMode, consultationStartTime]);

  // Disable context menu in consultation mode
  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => {
      if (consultationMode) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    const handleSelectStart = (e: Event) => {
      if (consultationMode) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    if (consultationMode) {
      document.addEventListener('contextmenu', handleContextMenu);
      document.addEventListener('selectstart', handleSelectStart);
      document.body.style.userSelect = 'none';
      document.body.style.webkitUserSelect = 'none';
    }

    return () => {
      document.removeEventListener('contextmenu', handleContextMenu);
      document.removeEventListener('selectstart', handleSelectStart);
      document.body.style.userSelect = '';
      document.body.style.webkitUserSelect = '';
    };
  }, [consultationMode]);

  return (
    <ThemeProvider theme={muiTheme}>
      <CssBaseline />
      <div
        className={`app ${collapsed ? 'collapsed' : ''} ${consultationMode ? 'consultation-mode' : ''}`}
      >
        <aside className="sidebar">
          <div className="sidebar-header">
            <h1 className="sidebar-title hide-when-collapsed">
              CSSECDV S19 Term 3 AY 2024-2025 Final Grades
            </h1>
            <IconButton
              size="small"
              color="inherit"
              aria-label="Toggle collapse"
              className="sidebar-collapse-btn"
              onClick={() =>
                setCollapsed((v) => {
                  const n = !v;
                  try {
                    localStorage.setItem('collapsed', String(n));
                  } catch {}
                  return n;
                })
              }
            >
              {collapsed ? <ChevronRightIcon /> : <ChevronLeftIcon />}
            </IconButton>
          </div>

          <div className="sidebar-section hide-when-collapsed">
            <TextField
              inputRef={searchInputRef}
              type="search"
              placeholder={
                consultationMode ? 'Search disabled in consultation mode' : 'Search students...'
              }
              value={consultationMode ? '' : query}
              onChange={(e) => !consultationMode && setQuery(e.target.value)}
              size="small"
              fullWidth
              disabled={consultationMode}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" />
                  </InputAdornment>
                ),
              }}
            />
          </div>

          <div className="sidebar-section hide-when-collapsed">
            <div className="sidebar-actions">
              <FormControl size="small" style={{ flex: 1 }}>
                <InputLabel id="theme-mode-label">Theme</InputLabel>
                <Select
                  labelId="theme-mode-label"
                  id="theme-select"
                  label="Theme"
                  value={theme}
                  onChange={(e) => {
                    const v = e.target.value as 'system' | 'light' | 'dark';
                    setTheme(v);
                    try {
                      localStorage.setItem('theme', v);
                    } catch {}
                  }}
                >
                  <MenuItem value="system">System</MenuItem>
                  <MenuItem value="light">Light</MenuItem>
                  <MenuItem value="dark">Dark</MenuItem>
                </Select>
              </FormControl>
              <Button
                size="small"
                variant="outlined"
                startIcon={showStatus ? <DoneIcon /> : <HelpOutlineIcon />}
                onClick={() =>
                  setShowStatus((s) => {
                    const v = !s;
                    try {
                      localStorage.setItem('showStatus', String(v));
                    } catch {}
                    return v;
                  })
                }
              >
                {showStatus ? 'Showing Status' : 'Show Status'}
              </Button>
              <Button
                size="small"
                variant={consultationMode ? 'contained' : 'outlined'}
                startIcon={<SecurityIcon />}
                color={consultationMode ? 'warning' : 'inherit'}
                onClick={() => {
                  if (consultationMode) {
                    setExitConsultationDialog(true);
                  } else {
                    setEnterConsultationDialog(true);
                  }
                }}
              >
                {consultationMode ? 'Exit Consultation' : 'Consultation Mode'}
              </Button>
            </div>
          </div>

          <div className="show-when-collapsed sidebar-collapsed-actions">
            <IconButton
              size="small"
              aria-label="Search"
              title="Search"
              onClick={() => {
                setCollapsed(false);
                setTimeout(() => searchInputRef.current?.focus(), 0);
              }}
            >
              <SearchIcon />
            </IconButton>
            <IconButton
              size="small"
              aria-label="Toggle Theme"
              title="Toggle Theme"
              onClick={() => {
                setTheme((prev) => {
                  const order: Array<'system' | 'light' | 'dark'> = ['system', 'light', 'dark'];
                  const next = order[(order.indexOf(prev) + 1) % order.length];
                  try {
                    localStorage.setItem('theme', next);
                  } catch {}
                  return next;
                });
              }}
            >
              <Brightness6Icon />
            </IconButton>
            <IconButton
              size="small"
              aria-label="Toggle Passed/Failed"
              title="Toggle Passed/Failed"
              onClick={() =>
                setShowStatus((s) => {
                  const v = !s;
                  try {
                    localStorage.setItem('showStatus', String(v));
                  } catch {}
                  return v;
                })
              }
            >
              {showStatus ? <DoneIcon /> : <HelpOutlineIcon />}
            </IconButton>
          </div>
          <div className="student-list">
            {!consultationMode && filteredIndex.length > 0 && (
              <div className="student-count hide-when-collapsed">
                {filteredIndex.length} {filteredIndex.length === 1 ? 'student' : 'students'}
                {query && ` matching "${query}"`}
              </div>
            )}
            {consultationMode && (
              <div className="consultation-warning hide-when-collapsed">
                <SecurityIcon fontSize="small" />
                <div>
                  <strong>Consultation Mode Active</strong>
                  <br />
                  <small>Click any student to switch with confirmation</small>
                </div>
              </div>
            )}
            {(consultationMode ? index : filteredIndex).map((s) => {
              const r = state.status === 'loaded' ? state.rows[s.rowIndex] : undefined;
              const fg = r ? Number(r['Unposted Final Grade'] ?? r['Final Grade']) : NaN;
              const isFail = Number.isFinite(fg) ? fg < 1.0 : false;
              const sis = r ? String(r['SIS User ID'] ?? r.ID ?? '').trim() : '';
              const ln = r ? String(r.LastName ?? '').trim() : '';
              const fn = r ? String(r.FirstName ?? '').trim() : '';
              const initials = `${ln.charAt(0) || ''}${fn.charAt(0) || ''}`.toUpperCase();
              return (
                <button
                  key={s.key}
                  className={`student-item ${collapsed ? 'compact' : ''} ${activeKey === s.key ? 'active' : ''}`}
                  onClick={() => {
                    const sis = String(
                      state.status === 'loaded'
                        ? (state.rows[s.rowIndex]['SIS User ID'] ?? state.rows[s.rowIndex].ID ?? '')
                        : ''
                    ).trim();
                    handleStudentSwitch(s.key, sis);
                  }}
                >
                  {collapsed ? (
                    <div className="avatar" title={s.displayName}>
                      {initials || '??'}
                    </div>
                  ) : (
                    <>
                      <div className="topline">
                        <div>{s.displayName}</div>
                        {showStatus &&
                          Number.isFinite(fg) &&
                          (isFail ? (
                            <Chip label="FAILED" color="error" variant="outlined" size="small" />
                          ) : (
                            <Chip label="PASSED" color="success" variant="outlined" size="small" />
                          ))}
                      </div>
                      <div className="muted" style={{ fontSize: 12 }}>
                        {sis}
                      </div>
                    </>
                  )}
                </button>
              );
            })}
            {filteredIndex.length === 0 && <div className="muted">No matches</div>}
          </div>
        </aside>
        <main className="content">
          {consultationMode && (
            <div className="consultation-mode-indicator">
              <SecurityIcon fontSize="small" />
              CONSULTATION MODE ACTIVE
            </div>
          )}
          {state.status === 'loading' && (
            <div style={{ display: 'grid', placeItems: 'center', padding: 24 }}>
              <CircularProgress />
            </div>
          )}
          {state.status === 'error' && <Alert severity="error">Error: {state.message}</Alert>}
          {state.status === 'loaded' && activeStudent && (
            <StudentDetail
              record={activeStudent}
              assignmentKeys={assignmentKeys}
              points={state.points}
              consultationMode={consultationMode}
              consultationShowScores={consultationShowScores}
              setConsultationShowScores={setConsultationShowScores}
            />
          )}
        </main>
      </div>

      {/* Student Switch Confirmation Dialog */}
      {/* Exit Consultation Mode Dialog */}
      <Dialog
        open={exitConsultationDialog}
        onClose={() => setExitConsultationDialog(false)}
        aria-labelledby="exit-consultation-dialog-title"
        aria-describedby="exit-consultation-dialog-description"
      >
        <DialogTitle id="exit-consultation-dialog-title">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 'bold' }}>
            <SecurityIcon color="warning" />
            Exit Consultation Mode?
          </div>
        </DialogTitle>
        <DialogContent>
          <DialogContentText id="exit-consultation-dialog-description">
            This will re-enable search and navigation features.
            <br />
            <br />
            Are you sure you want to exit consultation mode?
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setExitConsultationDialog(false)} color="inherit">
            Cancel
          </Button>
          <Button
            onClick={() => {
              setConsultationMode(false);
              setQuery('');
              setExitConsultationDialog(false);
              try {
                localStorage.setItem('consultationMode', 'false');
              } catch {}
            }}
            color="primary"
            variant="contained"
            autoFocus
          >
            Exit Consultation
          </Button>
        </DialogActions>
      </Dialog>

      {/* Enter Consultation Mode Dialog */}
      <Dialog
        open={enterConsultationDialog}
        onClose={() => setEnterConsultationDialog(false)}
        aria-labelledby="enter-consultation-dialog-title"
        aria-describedby="enter-consultation-dialog-description"
      >
        <DialogTitle id="enter-consultation-dialog-title">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 'bold' }}>
            <SecurityIcon color="warning" />
            Enable Consultation Mode?
          </div>
        </DialogTitle>
        <DialogContent>
          <DialogContentText id="enter-consultation-dialog-description">
            This will enable privacy protection features:
            <br />
            <br />
            • Require confirmation to switch students
            <br />
            • Disable search functionality
            <br />
            • Block navigation shortcuts
            <br />
            • Warn before leaving the page
            <br />
            <br />
            Use this during student consultations for privacy protection.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEnterConsultationDialog(false)} color="inherit">
            Cancel
          </Button>
          <Button
            onClick={() => {
              setConsultationMode(true);
              setQuery('');
              setEnterConsultationDialog(false);
              // Show auto-hide scores dialog
              setAutoHideScoresDialog(true);
              try {
                localStorage.setItem('consultationMode', 'true');
              } catch {}
            }}
            color="primary"
            variant="contained"
            autoFocus
          >
            Enable Consultation
          </Button>
        </DialogActions>
      </Dialog>

      {/* Auto-hide Scores Dialog */}
      <Dialog
        open={autoHideScoresDialog}
        onClose={() => setAutoHideScoresDialog(false)}
        aria-labelledby="auto-hide-dialog-title"
        aria-describedby="auto-hide-dialog-description"
      >
        <DialogTitle id="auto-hide-dialog-title">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 'bold' }}>
            <VisibilityOffIcon color="info" />
            Hide Scores for Privacy?
          </div>
        </DialogTitle>
        <DialogContent>
          <DialogContentText id="auto-hide-dialog-description">
            Hide all scores automatically for privacy protection?
            <br />
            <br />
            This is recommended for student consultations. You can show them manually when needed.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAutoHideScoresDialog(false)} color="inherit">
            Keep Visible
          </Button>
          <Button
            onClick={() => {
              setConsultationShowScores(false);
              setAutoHideScoresDialog(false);
              try {
                localStorage.setItem('consultationShowScores', 'false');
              } catch {}
            }}
            color="primary"
            variant="contained"
            autoFocus
          >
            Hide Scores
          </Button>
        </DialogActions>
      </Dialog>

      {/* Navigation Warning Dialog (Consultation Mode) */}
      <Dialog
        open={navigationWarningDialog}
        onClose={() => setNavigationWarningDialog(false)}
        aria-labelledby="nav-warning-dialog-title"
        aria-describedby="nav-warning-dialog-description"
      >
        <DialogTitle id="nav-warning-dialog-title">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 'bold' }}>
            <WarningIcon color="warning" />
            Leave Consultation Mode?
          </div>
        </DialogTitle>
        <DialogContent>
          <DialogContentText id="nav-warning-dialog-description">
            You are in consultation mode. Navigating away will exit consultation mode.
            <br />
            <br />
            Continue?
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setNavigationWarningDialog(false);
              setPendingNavigation(null);
            }}
            color="inherit"
          >
            Stay
          </Button>
          <Button
            onClick={() => {
              if (pendingNavigation) {
                pendingNavigation();
              }
              setNavigationWarningDialog(false);
              setPendingNavigation(null);
            }}
            color="primary"
            variant="contained"
            autoFocus
          >
            Leave
          </Button>
        </DialogActions>
      </Dialog>

      {/* Student Switch Dialog (existing) */}
      <Dialog
        open={!!pendingStudentKey}
        onClose={cancelStudentSwitch}
        aria-labelledby="student-switch-dialog-title"
        aria-describedby="student-switch-dialog-description"
      >
        <DialogTitle id="student-switch-dialog-title">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 'bold' }}>
            <WarningIcon color="warning" />
            Switch Student?
          </div>
        </DialogTitle>
        <DialogContent>
          <DialogContentText id="student-switch-dialog-description">
            You are about to switch to a different student's grades. This will hide the current
            student's information and show the new student's data.
            <br />
            <br />
            <strong>Are you sure you want to continue?</strong>
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={cancelStudentSwitch} color="inherit">
            Cancel
          </Button>
          <Button onClick={confirmStudentSwitch} color="primary" variant="contained" autoFocus>
            Switch Student
          </Button>
        </DialogActions>
      </Dialog>
    </ThemeProvider>
  );
}

function StudentDetail({
  record,
  assignmentKeys,
  points,
  consultationMode,
  consultationShowScores,
  setConsultationShowScores,
}: {
  record: CsvRow;
  assignmentKeys: string[];
  points: PointsPossibleMap;
  consultationMode: boolean;
  consultationShowScores: boolean;
  setConsultationShowScores: (value: boolean) => void;
}): JSX.Element {
  const lastName = String(record.LastName ?? '').trim();
  const firstName = String(record.FirstName ?? '').trim();
  const fullName = `${toTitleCase(lastName)}, ${toTitleCase(firstName)}`;
  const email = String(record['SIS Login ID'] ?? '').trim();
  const [showScores, setShowScores] = useState<boolean>(() =>
    readBooleanPreference('showScores', false)
  );

  // In consultation mode, use separate show/hide state
  const effectiveShowScores = consultationMode ? consultationShowScores : showScores;
  const concealClass = effectiveShowScores ? '' : 'conceal';
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  // Formatting helpers
  const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;
  const formatUpTo2 = (n: number): string =>
    round2(n).toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 0 });
  const format2 = (n: number): string =>
    round2(n).toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 });

  // Attempt to pick some summary fields if present
  const finalScore = record['Unposted Final Score'] ?? record['Final Score'];
  const finalGrade = record['Unposted Final Grade'] ?? record['Final Grade'];
  const currentScore = record['Unposted Current Score'] ?? record['Current Score'];

  // No computed overall or grade; rely on CSV-provided final values

  // Grouping configuration and classification
  const groupConfigs = useMemo(
    () => [
      // Case Study must be checked BEFORE Exams to ensure "Case Study Final" maps here
      { id: 'case_study', name: 'Case Study', weightPct: 40, patterns: [/case\s*study/i] },
      {
        id: 'exams',
        name: 'Exams (Midterm and Final)',
        weightPct: 10,
        patterns: [/\bmidterm\b/i, /\bfinal\b/i, /\bexam\b/i],
      },
      // Ensure items that start with "Practical Exercise" map here
      {
        id: 'practical_exercises',
        name: 'Practical Exercises',
        weightPct: 35,
        patterns: [/^\s*practical\s*exercises?\b/i, /\bpractical\b/i, /\bexercise\b/i, /\blab\b/i],
      },
      {
        id: 'class_activities',
        name: 'Class Activities',
        weightPct: 15,
        patterns: [
          /\bactivity\b/i,
          /\bdiscussion\b/i,
          /graded\s*discussion/i,
          /class\s*participation/i,
          /attendance/i,
          /\bquiz(z|zes)?\b/i,
          /threat\s*model/i,
          /authentication/i,
          /data\s*validation/i,
        ],
      },
    ],
    []
  );

  // Stable colors per category id
  const categoryColorById: Record<string, string> = useMemo(
    () => ({
      case_study: 'var(--cat-case-study)',
      exams: 'var(--cat-exams)',
      practical_exercises: 'var(--cat-practical)',
      class_activities: 'var(--cat-activities)',
      other: 'var(--muted)',
    }),
    []
  );

  const groupedAssignments = useMemo(() => {
    type Item = {
      key: string;
      raw: unknown;
      rawStr: string;
      max: number | undefined;
      num: number | null;
      pct: number | null;
      tone: string;
    };
    const makeItem = (key: string): Item => {
      const raw = record[key as keyof typeof record];
      const max = points[key];
      const num = toNumber(raw);
      const pct = num !== null && typeof max === 'number' && max > 0 ? (num / max) * 100 : null;
      const rawStr =
        raw === undefined || raw === null || String(raw).trim() === '' ? '—' : String(raw);
      const tone = pct === null ? 'muted' : pct >= 90 ? 'ok' : pct >= 75 ? 'warn' : 'bad';
      return { key, raw, rawStr, max, num, pct, tone };
    };

    const classify = (key: string): string => {
      const lower = key.toLowerCase();
      for (const g of groupConfigs) {
        if (g.patterns.some((rx) => rx.test(lower))) return g.id;
      }
      return 'other';
    };

    const map = new Map<string, Item[]>();
    const orderedIds = [...groupConfigs.map((g) => g.id), 'other'];
    for (const id of orderedIds) map.set(id, []);
    for (const key of assignmentKeys) {
      const id = classify(key);
      const arr = map.get(id);
      if (!arr) continue;
      arr.push(makeItem(key));
    }

    const buildTotals = (items: Item[]) => {
      let sumEarned = 0;
      let sumMax = 0;
      for (const it of items) {
        if (it.num !== null && typeof it.max === 'number' && it.max > 0) {
          sumEarned += it.num;
          sumMax += it.max;
        }
      }
      // Use average of item percentages if multiple items, else direct percent; safe fallback to null
      let pct: number | null = null;
      if (items.length > 0) {
        const itemPcts = items
          .map((i) => (i.pct !== null ? i.pct : null))
          .filter((v): v is number => v !== null);
        if (itemPcts.length > 0) {
          pct = itemPcts.reduce((a, b) => a + b, 0) / itemPcts.length;
        } else if (sumMax > 0) {
          pct = (sumEarned / sumMax) * 100;
        }
      }
      return { sumEarned, sumMax, pct };
    };

    const totalsById = Object.fromEntries(
      orderedIds.map((id) => [id, buildTotals(map.get(id) ?? [])])
    );

    const weightById: Record<string, number> = Object.fromEntries(
      groupConfigs.map((g) => [g.id, g.weightPct])
    );
    const totalWeight = Object.values(weightById).reduce((a, b) => a + b, 0);
    const weightNormalizedById: Record<string, number> = Object.fromEntries(
      orderedIds.map((id) => [
        id,
        totalWeight > 0 ? (weightById[id] ?? 0) * (100 / totalWeight) : 0,
      ])
    );

    const contribById: Record<string, number | null> = {};
    let overallPct = 0;
    for (const id of orderedIds) {
      const w = weightNormalizedById[id] ?? 0;
      const pct = (totalsById as Record<string, { pct: number | null }>)[id]?.pct ?? null;
      const contribution = pct !== null ? (pct * w) / 100 : null;
      contribById[id] = contribution;
      if (contribution !== null && w > 0) overallPct += contribution;
    }

    return {
      order: orderedIds,
      byId: map,
      totalsById: totalsById as Record<
        string,
        { sumEarned: number; sumMax: number; pct: number | null }
      >,
      weightById,
      weightNormalizedById,
      contribById,
      overallPct,
    } as const;
  }, [assignmentKeys, record, points, groupConfigs]);

  // Contributions panel: use per-category totals from CSV when available
  const contributionRows = useMemo(() => {
    const categoryColumnsById: Record<string, string[]> = {
      case_study: [
        'Case Study Final Score',
        'Case Study Unposted Final Score',
        'Case Study Current Score',
        'Case Study Unposted Current Score',
      ],
      exams: [
        'Exams Final Score',
        'Exams Unposted Final Score',
        'Exams Current Score',
        'Exams Unposted Current Score',
      ],
      practical_exercises: [
        'Practical Exercises Final Score',
        'Practical Exercises Unposted Final Score',
        'Practical Exercises Current Score',
        'Practical Exercises Unposted Current Score',
      ],
      class_activities: [
        'Class Activities Final Score',
        'Class Activities Unposted Final Score',
        'Class Activities Current Score',
        'Class Activities Unposted Current Score',
      ],
    };

    const pickCategoryPct = (id: string): number | null => {
      const candidates = categoryColumnsById[id] ?? [];
      for (const key of candidates) {
        const val = toNumber((record as Record<string, unknown>)[key]);
        if (val !== null) return val;
      }
      // Fallback to computed percentage from assignments if CSV aggregate is missing
      const computed = groupedAssignments.totalsById[id]?.pct;
      return computed ?? null;
    };

    const fs = toNumber(finalScore);
    // Build precise contributions first
    const precise = groupConfigs.map((cfg) => {
      const weight = groupedAssignments.weightNormalizedById[cfg.id] ?? cfg.weightPct;
      const catPct = pickCategoryPct(cfg.id);
      const contribPrecise = catPct !== null ? (catPct * weight) / 100 : null;
      return { id: cfg.id, name: cfg.name, weight, contribPrecise };
    });

    // Round contributions to at most 2 decimals for display
    const rows = precise.map((r) => ({
      id: r.id,
      name: r.name,
      weight: r.weight,
      contrib: r.contribPrecise !== null ? round2(r.contribPrecise) : null,
    }));

    // Ensure displayed contributions sum to Final Score when provided
    const fsRounded = fs !== null ? round2(fs) : null;
    if (fsRounded !== null) {
      const nonNullIdx = rows.map((r, i) => (r.contrib !== null ? i : -1)).filter((i) => i >= 0);
      if (nonNullIdx.length > 0) {
        const currentSum = round2(rows.reduce((a, r) => a + (r.contrib ?? 0), 0));
        const diff = round2(fsRounded - currentSum);
        if (diff !== 0) {
          const idxToAdjust = nonNullIdx[nonNullIdx.length - 1];
          rows[idxToAdjust] = {
            ...rows[idxToAdjust],
            contrib: round2((rows[idxToAdjust].contrib ?? 0) + diff),
          };
        }
      }
    }

    const computedSum = round2(rows.reduce((a, r) => a + (r.contrib ?? 0), 0));
    return { rows, sum: fsRounded !== null ? fsRounded : computedSum } as const;
  }, [
    groupConfigs,
    groupedAssignments.weightNormalizedById,
    groupedAssignments.totalsById,
    record,
    finalScore,
  ]);

  return (
    <div>
      <div className="detail-head">
        <div className="detail-left">
          <div className="student-name-section">
            <div className="name-and-status">
              <h1>{fullName}</h1>
              {finalGrade && (
                <div
                  className={`pass-fail-status ${Number(finalGrade) >= 1.0 ? 'passed' : 'failed'} ${concealClass}`}
                >
                  {Number(finalGrade) >= 1.0 ? 'PASSED' : 'FAILED'}
                </div>
              )}
            </div>
            {email && <div className="student-email">{email}</div>}
            <button
              className={`btn btn-sm ${consultationMode ? 'consultation-btn' : ''}`}
              onClick={() => {
                if (consultationMode) {
                  const newValue = !consultationShowScores;
                  setConsultationShowScores(newValue);
                  try {
                    localStorage.setItem('consultationShowScores', String(newValue));
                  } catch {}
                } else {
                  setShowScores((s) => {
                    const v = !s;
                    try {
                      localStorage.setItem('showScores', String(v));
                    } catch {}
                    return v;
                  });
                }
              }}
            >
              {consultationMode && <SecurityIcon fontSize="small" style={{ marginRight: 4 }} />}
              {effectiveShowScores ? 'Hide scores' : 'Show scores'}
              {consultationMode && ' (Consultation)'}
            </button>
          </div>
          <div className="meta">
            <div className="item">
              <div className="label">SIS User ID</div>
              <div className="value">{String(record['SIS User ID'] ?? record.ID ?? '')}</div>
            </div>
            <div className="item">
              <div className="label">Section</div>
              <div className="value">{String(record.Section ?? '')}</div>
            </div>
            {currentScore && (
              <div className="item">
                <div className="label">Current Score</div>
                <div className={`value ${concealClass}`}>{String(currentScore)}</div>
              </div>
            )}
          </div>
        </div>
        <div className="final-panel">
          {finalScore && (
            <div className="item" style={{ textAlign: 'right', marginBottom: 8 }}>
              <div className="label">Final Score</div>
              <div className={`final-score ${concealClass}`}>{String(finalScore)}</div>
            </div>
          )}
          {finalGrade && (
            <div className="item" style={{ textAlign: 'right' }}>
              <div className="label">Final Grade</div>
              <div
                className={`final-grade-pill ${Number(finalGrade) < 1.0 ? 'bad' : 'ok'} ${concealClass}`}
              >
                {String(finalGrade)}
              </div>
            </div>
          )}
        </div>
        <div className="contrib-panel">
          <header>Category Contributions</header>
          <div className="table-wrap" style={{ maxHeight: 'unset' }}>
            <table>
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Weight</th>
                  <th>Contrib</th>
                </tr>
              </thead>
              <tbody>
                {contributionRows.rows.map((r) => (
                  <tr key={r.id}>
                    <td className="muted" style={{ textAlign: 'left' }}>
                      <span
                        className="cat-dot"
                        style={{ backgroundColor: categoryColorById[r.id] ?? 'var(--muted)' }}
                      />
                      {r.name}
                    </td>
                    <td>{r.weight.toFixed(0)}%</td>
                    <td className={`${concealClass}`}>
                      {r.contrib !== null ? `${format2(r.contrib)}%` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <footer>
            <span className="muted">Final Score</span>
            <strong className={`${concealClass}`}>{`${format2(contributionRows.sum)}%`}</strong>
          </footer>
        </div>
      </div>

      {groupedAssignments.order.map((groupId) => {
        const groupItems = groupedAssignments.byId.get(groupId) ?? [];
        if (groupItems.length === 0) return null;
        const cfg = groupConfigs.find((g) => g.id === groupId);
        const weightDisplay = cfg
          ? (groupedAssignments.weightNormalizedById[groupId] ?? cfg.weightPct)
          : 0;
        const label = cfg ? `${cfg.name} — ${weightDisplay}%` : 'Other';
        const totals = groupedAssignments.totalsById[groupId];
        const rowForContrib = contributionRows.rows.find((r) => r.id === groupId);
        const contribution = rowForContrib?.contrib ?? null;
        const open = openGroups[groupId] ?? false;
        const setOpen = (updater: (v: boolean) => boolean) => {
          setOpenGroups((prev) => {
            const nextVal = updater(prev[groupId] ?? false);
            return { ...prev, [groupId]: nextVal };
          });
        };
        return (
          <div key={groupId} style={{ marginBottom: 20 }}>
            <button
              className={`category-header-btn ${open ? 'expanded' : ''}`}
              onClick={() => setOpen((v) => !v)}
              aria-label={open ? 'Collapse' : 'Expand'}
              style={{
                marginTop: 8,
                backgroundColor: `color-mix(in srgb, ${categoryColorById[groupId] ?? 'var(--muted)'} 8%, var(--panel-elevated))`,
              }}
            >
              <div className="header-title">
                <div className="expand-icon">
                  {open ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                </div>
                <h2 style={{ margin: 0, fontSize: 16 }}>{label}</h2>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {totals && (
                  <div className={`pill ${concealClass}`}>
                    {totals.pct !== null ? `${formatUpTo2(totals.pct)}%` : '—'}
                  </div>
                )}
                <div className={`pill ${concealClass}`}>
                  contrib: {contribution !== null ? `${format2(contribution)}%` : '—'}
                </div>
              </div>
            </button>
            {open && (
              <div className="grid">
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th style={{ width: '60%' }}>Activity</th>
                        <th>Score</th>
                        <th>Max</th>
                        <th>%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {groupItems.map((it) => (
                        <tr key={it.key}>
                          <td>{it.key}</td>
                          <td className={`${it.tone} ${concealClass}`}>{it.rawStr}</td>
                          <td className={`muted ${concealClass}`}>
                            {typeof it.max === 'number' ? it.max.toFixed(2) : '—'}
                          </td>
                          <td className={`${it.tone} ${concealClass}`}>
                            {it.pct !== null ? `${it.pct.toFixed(1)}%` : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
