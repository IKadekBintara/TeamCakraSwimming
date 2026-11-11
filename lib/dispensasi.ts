export const defaultLayout = {
  margin: 56,
  headerHeight: 143,
  fontSize: 11.5,
  leading: 15,
  signatureX: 84,
  signatureGap: 60,
};

export const defaultOpening =
  "Sehubungan dengan keikutsertaan Ananda {atlet} dalam kejuaraan {acara}, kami memohon kepada Bapak/Ibu Kepala Sekolah agar memberikan dispensasi dari kegiatan belajar pada {izin}.";
export const defaultClosing =
  "Demikian permohonan dispensasi ini kami sampaikan. Besar harapan kami agar Bapak/Ibu Kepala Sekolah berkenan memberikan dispensasi kepada Ananda. Atas perhatian dan kerja sama Bapak/Ibu, kami ucapkan terima kasih.";

export type Letter = {
  athlete: string;
  school: string;
  event: string;
  venue: string;
  eventDate: string;
  eventEnd: string;
  leaveDates: string[];
  city: string;
  issueDate: string;
  number: string;
  attachment: string;
  subject: string;
  position: string;
  organization: string;
  signer: string;
  opening: string;
  closing: string;
};
