import useTranslation from '../../i18n/useTranslation.js'
import { projectRepository, teamMembers } from '../../config/team.js'
import GithubIcon from '../common/GithubIcon.jsx'
import ExternalLink from '../common/ExternalLink.jsx'

export default function AboutContent({ titleId, descriptionId }) {
  const { t } = useTranslation()
  return <section className="about-content" aria-labelledby={titleId}>
    <h1 id={titleId}>{t('onboarding.about.title')}</h1>
    <p id={descriptionId} className="about-summary">{t('onboarding.about.description')}</p>
    <h2 className="about-heading">{t('onboarding.about.team')}</h2>
    <ul className="about-team">
      {teamMembers.map((member) => <li key={member.profile}>
        <img src={member.photo} alt={t('onboarding.about.photo', { name: member.name })} width="64" height="64" loading="lazy" />
        <div className="about-team__details">
          <span className="about-team__name">{member.name}</span>
          <span lang="en">{member.role}</span>
        </div>
        <a className="about-github" href={member.profile} target="_blank" rel="noopener noreferrer"
          aria-label={t('onboarding.about.profile', { name: member.name })} title={t('onboarding.about.profile', { name: member.name })}>
          <GithubIcon />
        </a>
      </li>)}
    </ul>
    <div className="about-repository">
      <h2 className="about-heading">{t('onboarding.about.repository')}</h2>
      <p>{t('onboarding.about.repositoryDescription')}</p>
      <a href={projectRepository} target="_blank" rel="noopener noreferrer">
        <GithubIcon />{t('onboarding.about.repositoryLink')}<ExternalLink />
      </a>
    </div>
  </section>
}
