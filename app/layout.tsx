import type { Metadata } from 'next';
import './globals.css';
export const metadata:Metadata={title:'DukaTrack — Business workspace',description:'Sales, stock and customer credit. A simpler way to run your business.',manifest:'/manifest.webmanifest',icons:{icon:'/icon.svg'}};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
