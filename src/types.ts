export type CsvRow = Record<string, string | number | null | undefined> & {
  LastName?: string;
  FirstName?: string;
  ID?: string;
  'SIS User ID'?: string;
  'SIS Login ID'?: string;
  Section?: string;
};

export interface PointsPossibleMap {
  [columnName: string]: number;
}

export interface StudentIndexItem {
  key: string;
  displayName: string;
  lastName: string;
  firstName: string;
  rowIndex: number;
}
