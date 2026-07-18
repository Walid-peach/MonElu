import type { Metadata } from 'next'
import { QuizClient } from './QuizClient'

export const metadata: Metadata = {
  title: 'Quel député vote comme vous ? — MonÉlu',
  description:
    'Répondez à une dizaine de vrais scrutins de l’Assemblée nationale et découvrez ' +
    'quel député vote comme vous. Sans compte, rien n’est enregistré.',
}

export default function QuizPage() {
  return <QuizClient />
}
